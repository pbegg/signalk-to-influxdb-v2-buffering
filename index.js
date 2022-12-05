
// Filename:    signalk-to-influxdb-v2-buffering
//
// Description: The plugin is designed to do batch writes to a cloud hosted influxdb2.0
//              data base.The Plugin now uses the https://github.com/influxdata/influxdb-client-js
//              library. If the connection to the influxdb is down the batch of metrics should be
//              buffered and re-uploaded when the internet connection is re-established
//
// Repository:  https://github.com/pbegg/signalk-to-influxdb-v2-buffering
//
// Updated:     August 2022
//
// Notes:       Aug 2022 add new functionality:
//              -   now able to push numeric, text and boolean data types to InfluxDB-V2, and other data types as JSON
//              -   added ability to push data from contexts outside of 'vessel.self'
//              -   added ability to expand properties of any measurement (i.e. building on previous ability
//                  to expand position and attitude, now any measurement with multiple properties can be expanded)
//              -   added ablity to add tags against each individual path
//              -   added the source and context as tags for each measurement
//              -   improved handling of wildcard '*' for context and path
//              -   lots of unecessary refactoring and tidy-up

const { InfluxDB, Point, HttpError } = require('@influxdata/influxdb-client')

module.exports = function (app) {

    let options;
    let writeApi;
    let unsubscribes = [];
    let tagAsSelf = false;
    let selfContext;

    let getSelfContext = function () {

        // get the current 'vessel.self' context - this seems unnecessarily difficult due to 
        // limitations in the signalK network and may cause inconsistant results depending on 
        // whether UUID or MMSI is defined in the Vessel Base Data on the Server -> Settings page
        const selfUuid = app.getSelfPath('uuid');
        const selfMmsi = app.getSelfPath('mmsi');

        if (selfUuid != null) { // not null or undefined value
            return "vessels." + selfUuid;
        } else if (selfMmsi != null) {
            return "vessels.urn:mrn:imo:mmsi:" + selfMmsi.toString();
        }
        return null;
    };

    let addInfluxField = function (point, name, value, expand = false) {

        switch (typeof value) {
            case 'string':
                point.stringField(name, value);
                break;

            case 'number':
                // note that point.floatField will throw an exception for infinite
                // values like[Fuel Economy = Speed / Rate], when fuel rate is 0
                // https://github.com/pbegg/signalk-to-influxdb-v2-buffering/pull/13#discussion_r656656037
                if (isFinite(value) && !isNaN(value)) {
                    point.floatField(name, value);
                }
                break;

            case 'boolean':
                point.booleanField(name, value);
                break;

            case 'object':
                // if the 'expand' option is selected then add a field for each property 
                // (n.b.recursive / if any obects are self-referential this will break)
                if (expand === true) {
                    for (const property in value) {
                        addInfluxField(point, property, value[property], true);
                    }
                    break;
                }
                // if 'expand' is false, drop through to send the object as JSON
            default:
                if (value != null) {
                    // could be an object, function, whatever... so stringify it...
                    // note that stringify also can't cope with self-references 
                    point.stringField(name, JSON.stringify(value));
                }
                break;
        }
    }

    let getInfluxPoint = function (source, context, path, value, timestamp, pathOption) {

        // The Point object defines the value for a single measurement,
        // and performs internal type and error checking for each value.
        // Note:
        // - the methods .intField and.uintField aren't used as all numeric values are mapped to floatField
        // - any errors with floatField, stringField etc throw an exception thats caught by the calling function
        const point = new Point(path)
            .timestamp(Date.parse(timestamp));

        // Add the value of the given field
        addInfluxField(point, "value", value, (pathOption.expand == null ? false : pathOption.expand));

        // Add path-level tags if any have been defined
        if (pathOption.pathTags != null) {
            pathOption.pathTags.forEach(tag => {
                point.tag(tag["name"], tag["value"]);
            });
        }

        // Add a tag for the source, in particular so that readings from different 
        // NMEA2K devices can be filtered - for example its common now for multiple
        // measurements for 'navigation.position' to be received over NMEA2K from all 
        // the different squawky devices like GPS, AIS, radios, weather station etc...
        if (source != null) {
            point.tag("source", source);
        }

        // Add a tag with the context so its clear which UUID generated the update 
        if (context != null && context.length > 0) {
            point.tag("context", context);
        }

        // Add a tag {self: true} when the measurement originates from this vessel -
        // this is reliant on an MMSI or UUID to be set in the Vessel Base Data on 
        // the Server -> Settings page. Potentially it may be inconsistant depending 
        // on what UUID / MMSI is set so can be turned off on the plugin settings page, 
        // and manually added as a tag for individual path(s) if needed
        if (tagAsSelf === true && context.localeCompare(selfContext) === 0) {
            point.tag("self", true);
        }

        app.debug(`Sending to InfluxDB-V2: '${JSON.stringify(point)}'`);
        return point
    };

    let handleUpdates = function (delta, pathOption) {

        // iterate through each update received from the subscription manager
        delta.updates.forEach(update => {

            //if no u.values then return as there are no values to display
            if (!update.values) {
                return
            }

            // iterate through each value received in the update
            update.values.forEach(val => {
                try {
                    // if the value is an object and the 'expand' option is set true, each property will be
                    // unpacked into separate rows in InfluxDB. Note this is recursive - the code will loop to
                    // unpack properties at all layers (and hypothetically if any obects were self-referential
                    // this will throw an exception)
                    writeApi.writePoint(getInfluxPoint(
                        update["$source"],
                        delta.context,
                        val.path,
                        val.value,
                        update.timestamp,
                        pathOption));
                } catch (error) {
                    // log any errors thrown (and skip writing this value to InfluxDB)
                    app.error(`Error: skipping updated value ${JSON.stringify(val)}`)
                }
            });
        });
    };

    let _start = function (opts) {

        app.debug(`${plugin.name} Started...`)

        // set variables from plugin options
        options = opts;
        selfContext = getSelfContext();
        const url = options["influxHost"];
        const token = options["influxToken"];
        const org = options["influxOrg"];
        const bucket = options["influxBucket"];
        const writeOptions = options["writeOptions"];
        if (options["tagAsSelf"]) {
            tagAsSelf = options["tagAsSelf"];
        }

        // create InfluxDB api object
        writeApi = new InfluxDB({
            url,
            token
        }).getWriteApi(
            org,
            bucket,
            'ms',
            writeOptions);

        // add default (global) tags, if any have been defined
        if (options.defaultTags != null) {
            let defaultTags = {}
            options.defaultTags.forEach(tag => {
                defaultTags[tag["name"]] = tag["value"];
            });
            app.debug(`Default tags: ${JSON.stringify(defaultTags)}`);
            writeApi.useDefaultTags(defaultTags);
        }

        // add subscriptions to signalK updates - note the subscription is created
        // individually per path, as there may be different paremeters set for the context
        options.pathArray.forEach(pathOption => {

            // its useful to be able to turn paths on or off, when trying out options for setup of InfluxDB2.0
            if (pathOption.enabled === true) {

                // create a subsciption definition
                localSubscription = {
                    "context": pathOption.context,
                    "subscribe": [{
                        "path": pathOption.path,
                        "policy": "instant",
                        "minPeriod": pathOption.interval
                    }]
                };

                // subscribe to updates for the context and path
                app.subscriptionmanager.subscribe(
                    localSubscription,
                    unsubscribes,
                    subscriptionError => {
                        app.error('Error: ' + subscriptionError);
                    },
                    delta => {
                        // add a handler for this update
                        // app.debug(`Received delta: ${JSON.stringify(delta)}`);
                        handleUpdates(delta, pathOption);
                    }
                );
                app.debug(`Added subscription to: ${JSON.stringify(localSubscription)}`);
            } else {
                app.error(`Skipping subscription to: ${pathOption.context}/.../${pathOption.path}`);
            }
        });
    };

    let _stop = function (options) {
        app.debug(`${plugin.name} Stopped...`)
        unsubscribes.forEach(f => f());
        unsubscribes = [];
    };

    const plugin = {
        id: "signalk-to-influxdb-v2-buffer",
        name: "Signalk To Influxdbv2.0",
        schema: {
            "type": "object",
            "description": "This plugin saves data to an influxdbv2 database, and buffers data without an internet connection (note: a server restart is needed for updated settings to take effect)",
            "required": [
                "influxHost",
                "influxToken",
                "influxOrg",
                "influxBucket",
                "uploadFrequency"
            ],
            "properties": {
                "influxHost": {
                    "type": "string",
                    "title": "Influxdb2.0 Host URL",
                    "description": "the url to your cloud hosted influxb2.0"
                },
                "influxToken": {
                    "type": "string",
                    "title": "Influxdb2.0 Token",
                    "description": "the token for your cloud hosted influxb2.0 bucket"
                },
                "influxOrg": {
                    "type": "string",
                    "title": "Influxdb2.0 Organisation",
                    "description": "your Influxdb2.0 organisation"
                },
                "influxBucket": {
                    "type": "string",
                    "title": "Influxdb2.0 Bucket",
                    "description": "which bucket you are storing the metrics in"
                },
                "writeOptions": {
                    "type": "object",
                    "title": "Write Options",
                    "required": [
                        "batchSize",
                        "flushInterval",
                        "maxBufferLines",
                        "maxRetries",
                        "maxRetryDelay",
                        "minRetryDelay",
                        "retryJitter"
                    ],
                    "properties": {
                        "batchSize": {
                            "type": "number",
                            "title": "Batch Size",
                            "description": "the maximum points/line to send in a single batch to InfluxDB server",
                            "default": 1000
                        },
                        "flushInterval": {
                            "type": "number",
                            "title": "Flush Interval",
                            "description": "maximum time in millis to keep points in an unflushed batch, 0 means don't periodically flush",
                            "default": 30000
                        },
                        "maxBufferLines": {
                            "type": "number",
                            "title": "Maximum Buffer Lines",
                            "description": "maximum size of the retry buffer - it contains items that could not be sent for the first time",
                            "default": 32000
                        },
                        "maxRetries": {
                            "type": "number",
                            "title": "Maximum Retries",
                            "description": "maximum delay between retries in milliseconds",
                            "default": 3
                        },
                        "maxRetryDelay": {
                            "type": "number",
                            "title": "Maximum Retry Delay",
                            "description": "maximum delay between retries in milliseconds",
                            "default": 5000
                        },
                        "minRetryDelay": {
                            "type": "number",
                            "title": "Minimum Retry Delay",
                            "description": "minimum delay between retries in milliseconds",
                            "default": 180000
                        },
                        "retryJitter": {
                            "type": "number",
                            "title": "Retry Jitter",
                            "description": "a random value of up to retryJitter is added when scheduling next retry",
                            "default": 200
                        }
                    }
                },
                "tagAsSelf": {
                    "type": "boolean",
                    "title": "Tag vessel measurements as 'self' if applicable",
                    "description": "tag measurements as {self: true} when from vessel.self - requires an MMSI or UUID to be set in the Vessel Base Data on the Server->Settings page",
                    "default": false
                },
                "defaultTags": {
                    "type": "array",
                    "title": "Default Tags",
                    "description": "default tags added to every measurement sent to InfluxDB",
                    "default": [],
                    "items": {
                        "type": "object",
                        "required": [
                            "name",
                            "value"
                        ],
                        "properties": {
                            "name": {
                                "type": "string",
                                "title": "Tag Name"
                            },
                            "value": {
                                "type": "string",
                                "title": "Tag Value"
                            }
                        }
                    }
                },
                "pathArray": {
                    "type": "array",
                    "title": "Paths",
                    "default": [],
                    "items": {
                        "type": "object",
                        "required": [
                            "context",
                            "path",
                            "interval"
                        ],
                        "properties": {
                            "enabled": {
                                "type": "boolean",
                                "title": "Enabled?",
                                "description": "enable writes to Influxdb2.0 for this path (server restart is required)",
                                "default": true
                            },
                            "context": {
                                "type": "string",
                                "title": "SignalK context",
                                "description": "context to record e.g.'self' for own ship, or 'vessels.*' for all vessels, or '*' for everything",
                                "default": "self"
                            },
                            "path": {
                                "type": "string",
                                "title": "SignalK path",
                                "description": "path to record e.g.'navigation.position' for positions, or 'navigation.*' for all navigation data, or '*' for everything",
                            },
                            "interval": {
                                "type": "number",
                                "description": "milliseconds between data records",
                                "title": "Recording interval",
                                "default": 1000
                            },
                            "expand": {
                                "type": "boolean",
                                "title": "Expand properties",
                                "description": "select to expand the properties of each measurement into separate rows where possible e.g. 'navigation.position' would expand into three rows for 'navigation.position.latitude','navigation.position.longitude' and 'navigation.position.altitude'. If not selected, the measurement is written to InfluxDB as one row where value={JSON}, and field tags are added for each property. We recommend to turn this on to avoid exceeding cardinality limits in Influx",
                                "default": true
                            },
                            "pathTags": {
                                "title": "Path tags",
                                "type": "array",
                                "description": "Define any tags to include for this path:",
                                "default": [],
                                "items": {
                                    "type": "object",
                                    "required": [
                                        "name",
                                        "value"
                                    ],
                                    "properties": {
                                        "name": {
                                            "type": "string",
                                            "title": "Tag Name"
                                        },
                                        "value": {
                                            "type": "string",
                                            "title": "Tag Value"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        start: _start,
        stop: _stop
    }
    return plugin
}