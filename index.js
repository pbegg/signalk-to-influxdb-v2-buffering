
// Filename:    signalk-to-influxdb-v2-buffering
//
// Description: The plugin is designed to do batch writes to a cloud hosted influxdb2.0
//              data base.The Plugin now uses the https://github.com/influxdata/influxdb-client-js
//              library. If the conenction to the influxdb is down the batch of metrics should be
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
//              -   added ability to add tags against each individual path
//              -   added the context & path to the name of each measurement 
//              -   improved handling of wildcard '*' for context and path 
//              -   lots of unnecessary refactoring and tidy-up

const { InfluxDB, Point, HttpError } = require('@influxdata/influxdb-client')

module.exports = function (app) {

    let options;
    let writeApi;
    let unsubscribes = []

    let getInfluxPoint = function (context, path, value, timestamp, pathTags) {

        // The Point object defines the value for a single measurement,
        // and performs internal type and error checking for each value.
        // Note:
        // - the methods .intField and.uintField aren't used as all numeric values are mapped to floatField
        // - any errors with floatField, stringField etc throw an exception thats caught by the calling function

        // Backwards compatibility - don't include context if its not defined (i.e. and the default vessel.self is being used)
        let measurement = path;
        if (context) { 
            let measurement = context + "." + path;
        }

        const point = new Point(path)
            .timestamp(Date.parse(timestamp));

        switch (typeof value) {
            case 'string':
                point.stringField('value', value)
                break;

            case 'number':
                point.floatField('value', value)
                break;

            case 'boolean':
                point.booleanField('value', value)
                break;

            default:
                // could be an object, function, undefined, whatever... so stringify it
                point.stringField('value', JSON.stringify(value))
                break;
        }

        // Add tags if any have been defined
        if (pathTags !== undefined) {
            pathTags.forEach(tag => {
                point.tag(tag["name"], tag["value"]);
            });
        }

        app.debug(`Sending to InfluxDB-V2: '${JSON.stringify(point)}'`);
        return point
    }

    let handleUpdates = function (delta, pathOption) {

        // iterate through each update received from the subscription manager
        delta.updates.forEach(update => {
            try {
                //app.debug(`Received update: '${JSON.stringify(update)}'`);

                //if no u.values then return as there are no values to display
                if (!update.values) {
                    return
                }

                // iterate through each value received in the update
                update.values.forEach(val => {

                    // if the value is an object, it may have properties to be unpacked into seperate measurements
                    if (typeof val.value === 'object' && pathOption.expand === true) {
                        for (const prop in val.value) {
                            const prop_path = val.path + "." + prop;
                            const prop_val = val.value[prop]
                            writeApi.writePoint(getInfluxPoint(delta.context, prop_path, prop_val, update.timestamp, pathOption.pathTags));
                        }
                    }
                    // otherwise just write a point with a single value to InfluxDB
                    else {
                        writeApi.writePoint(getInfluxPoint(delta.context, val.path, val.value, update.timestamp, pathOption.pathTags));
                    }
                });

            } catch (error) {
                // log any errors thrown (and skip writing this value to InfluxDB)
                valuesString = JSON.stringify(values);
                app.error(`Error: skipping update for path '${path}' because value '${valuesString}' is invalid`)
            }
        });
    }

    let _start = function (opts) {

        app.debug(`${plugin.name} Started...`)

        // set variables from plugin options
        options = opts;
        const url = options["influxHost"]
        const token = options["influxToken"]
        const org = options["influxOrg"]
        const bucket = options["influxBucket"]
        const writeOptions = options["writeOptions"]

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
        if (options.defaultTags !== undefined) {
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
                    //app.debug(`Received update: ${JSON.stringify(delta)}`);
                    handleUpdates(delta, pathOption);
                }
            );
            app.debug(`Added subscription to: ${JSON.stringify(localSubscription)}`);
        });
    }

    let _stop = function (options) {
        app.debug(`${plugin.name} Stopped...`)
        unsubscribes.forEach(f => f());
        unsubscribes = [];
    }

    const plugin = {
        "id": "signalk-to-influxdb-v2-buffer",
        "name": "Signalk To Influxdbv2.0",
        "schema": {
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
                "defaultTags": {
                    "type": "array",
                    "title": "Default Tags",
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
                            "context": {
                                "type": "string",
                                "title": "SignalK context",
                                "description": "context to record e.g.'vessels.self' for own ship, or 'vessels.*' for all vessels, or '*' for everything",
                                "default": "vessels.self"
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
                                "description": "select to expand the properties of each measurement into separate values where possible e.g. 'navigation.position' would expand into three values 'navigation.position.latitude','navigation.position.longitude' and 'navigation.position.altitude'",
                                "default": false
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
