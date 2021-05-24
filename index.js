const {InfluxDB, Point, HttpError} = require('@influxdata/influxdb-client')




module.exports = function (app) {

  let unsubscribes = []

  let metricArray = []
  let bufferArray = []

  let influxUploadTimer

  let vesselname = app.getSelfPath('name')
  let vesselfleet = app.getSelfPath('fleet')

  let modifyPath = function(path,values,signalkTimestamp,options) {
    if (path == "navigation.position") {
      const pathLatitude = "navigation.position.latitude"
      const valueLatitude = values['latitude']
      const timestamp = signalkTimestamp

      const pathLongitude = "navigation.position.longitude"
      const valueLongitude = values['longitude']

      const latitude = {path: pathLatitude, value: valueLatitude, timestamp: timestamp}
      const longitude = {path: pathLongitude, value: valueLongitude, timestamp: timestamp}

      return [latitude,longitude]

      //influxFormat(pathLatitude,valueLatitude,timestamp,options)
      //influxFormat(pathLongitude,valueLongitude,timestamp,options)
    }

    if (path == "navigation.attitude") {
      const pathRoll = "navigation.attitude.roll"
      const valueRoll = values['roll']
      const timestamp = signalkTimestamp

      const pathPitch = "navigation.attitude.pitch"
      const valuePitch = values['pitch']

      const pathYaw = "navigation.attitude.yaw"
      const valueYaw = values['yaw']

      const roll = {path: pathRoll, value: valueRoll, timestamp: timestamp}
      const pitch = {path: pathPitch, value: valuePitch, timestamp: timestamp}
      const yaw = {path: pathYaw, value: valueYaw, timestamp: timestamp}

      return [roll,pitch,yaw]

      //influxFormat(pathRoll,valueRoll,timestamp,options)
      //influxFormat(pathPitch,valuePitch,timestamp,options)
      //influxFormat(pathYaw,valueYaw,timestamp,options)
    }
  }


  let signalkPathCheck = function(path) {
    if (path == "navigation.position") {
      return true
    }

    if (path == "navigation.attitude") {
      return true
    }
  }

  let influxFormat = function(path,values,signalkTimestamp,options) {
      const measurement = path
      const fields = {"value":values}
      const timestamp = Date.parse(signalkTimestamp)

      const point = new Point(measurement)
      	.floatField('value',values)
      	.timestamp(Date.parse(signalkTimestamp))

      app.debug(point)

      return point


      //metricArray.push(metric)
  }


  let _localSubscription = function(options) {
    const subscribeArray = []
    options.pathArray.forEach(path => {
      const subscribe = {}
      subscribe.path = path.path
      subscribe.policy = "instant"
      subscribe.minPeriod = path.interval
      subscribeArray.push(subscribe)
    })
    app.debug(subscribeArray)
    return (localSubscription = {
      "context" : "vessels.self",
      "subscribe" : subscribeArray
    })
  }


  let _start = function(options) {
    app.debug(`${plugin.name} Started...`)

    //Set Variables from plugin options
    const url = options["influxHost"]
    const token = options["influxToken"]
    const org = options["influxOrg"]
    const bucket = options["influxBucket"]
    const writeOptions = options["writeOptions"]
    const defaultTags = {}

    options.defaultTags.forEach(tag => {
    	defaultTags[tag["tagName"]]=tag["tagValue"]
    	app.debug(defaultTags)

    })

    //Create InfluxDB
    const writeApi = new InfluxDB({
    	url,
    	token})
    		.getWriteApi(
    			org,
    			bucket,
    			'ms',
    			writeOptions)

    writeApi.useDefaultTags(defaultTags)


    app.subscriptionmanager.subscribe(
      _localSubscription(options),
      unsubscribes,
      subscriptionError => {
        app.error('Error:' + subscriptionError);
      },
      delta => {
        delta.updates.forEach(u => {
          //if no u.values then return as there is no values to display
          if (!u.values || u.values == null) {
            return
          }
          // Avoid Error: Expected float value for field value but got string
          if (isNaN(parseFloat(u.values))) {
            return
          }

          const path = u.values[0].path
          const values = u.values[0].value
          const timestamp = u.timestamp

          if (signalkPathCheck(path) == true) {

            const pathArray = modifyPath(path,values,timestamp,options)
            pathArray.forEach(seperatePath => {
              app.debug(seperatePath)
              if (isNaN(seperatePath["value"])) {
                return
              }
              else {
                writeApi.writePoint(influxFormat(seperatePath.path,seperatePath.value,seperatePath.timestamp,options))
              }
            })
          }
          else {
            if (isNaN(values) || values == null) {
              return
            }
            else {
              	writeApi.writePoint(influxFormat(path,values,timestamp,options))
            }
          }
        });
      }
    );
  }

 let _stop = function(options) {
    app.debug(`${plugin.name} Stopped...`)
    unsubscribes.forEach(f => f());
    unsubscribes = [];

//if (influxUploadTimer) {
//clearInterval(influxUploadTimer);
//}
//// clean up the state
//influxUploadTimer = undefined;
//}
 }


 const plugin = {
	   "id":"signalk-to-influxdb-v2-buffer",
	   "name":"Signalk To Influxdbv2.0",
	   "description":"Plugin that saves data to an influxdbv2 database - buffers data without internet connection",
	   "schema":{
	      "type":"object",
	      "required":[
	         "influxHost",
	         "influxToken",
	         "influxOrg",
	         "influxBucket",
	         "uploadFrequency"
	      ],
	      "properties":{
	         "influxHost":{
	            "type":"string",
	            "title":"Influxdb2.0 Host URL",
	            "description": "the url to your cloud hosted influxb2.0"
	         },
	         "influxToken":{
	            "type":"string",
	            "title":"Influxdb2.0 Token",
	            "description": "the token for your cloud hosted influxb2.0 bucket"
	         },
	         "influxOrg":{
	            "type":"string",
	            "title":"Influxdb2.0 Organisation",
	            "description": "your influxdb2.0 organistion"
	         },
	         "influxBucket":{
	            "type":"string",
	            "title":"Influxdb2.0 Bucket",
	            "description": "which bucket you are storing the metrics in"
	         },
	         "writeOptions":{
	            "type":"object",
	            "title": "Influx Write Options",
	            "required":[
	               "batchSize",
	               "flushInterval",
	               "maxBufferLines",
	               "maxRetries",
	               "maxRetryDelay",
	               "minRetryDelay",
	               "retryJitter"
	            ],
	            "properties":{
	               "batchSize":{
	                  "type":"number",
	                  "title":"Batch Size",
	                  "description": "the maximum points/line to send in a single batch to InfluxDB server",
	                  "default": 1000
	               },
	               "flushInterval":{
	                  "type":"number",
	                  "title":"Flush Interval",
	                  "description": "maximum time in millis to keep points in an unflushed batch, 0 means don't periodically flush",
	                  "default": 30000
	               },
	               "maxBufferLines":{
	                  "type":"number",
	                  "title":"Maximum Buffer Lines",
	                  "description": "maximum size of the retry buffer - it contains items that could not be sent for the first time",
	                  "default": 32000
	               },
	               "maxRetries":{
	                  "type":"number",
	                  "title":"Maximum Retries",
	                  "description": "maximum delay between retries in milliseconds",
	                  "default": 3
	               },
	               "maxRetryDelay":{
	                  "type":"number",
	                  "title":"Maximum Retry Delay",
	                  "description": "maximum delay between retries in milliseconds",
	                  "default": 5000
	               },
	               "minRetryDelay":{
	                  "type":"number",
	                  "title":"Minimum Retry Delay",
	                  "description": "minimum delay between retries in milliseconds",
	                  "default": 180000
	               },
	               "retryJitter":{
	                  "type":"number",
	                  "title":"Retry Jitter",
	                  "description": "a random value of up to retryJitter is added when scheduling next retry",
	                  "default": 200
	               }
	           }
	       },
	           "defaultTags":{
	            "type":"array",
	            "title": "Default Tags",
	            "items": {
	            	"type": "object",
			"required":[
				"tagName",
				"tagValue"
			],
			"properties":{
	                  "tagName":{
	                     "type":"string",
	                     "title":"Tag Name"
	                  },
	                  "tagValue":{
	                     "type":"string",
	                     "title":"Tag Value"
	                  }
			}
	            }
	         },
	         "pathArray":{
	            "type":"array",
	            "title":"Paths",
	            "default":[
	            ],
	            "items":{
	               "type":"object",
	               "required":[
	                  "path",
	                  "interval"
	               ],
	               "properties":{
	                  "path":{
	                     "type":"string",
	                     "title":"Signal K path to record"
	                  },
	                  "interval":{
	                     "type":"number",
	                     "title":"Record Interval",
	                     "default":1000
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
