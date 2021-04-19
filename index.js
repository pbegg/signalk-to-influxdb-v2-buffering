const buffer = require('./buffer.js')
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

      influxFormat(pathLatitude,valueLatitude,timestamp,options)
      influxFormat(pathLongitude,valueLongitude,timestamp,options)
    }

    if (path == "navigation.attitude") {
      const pathRoll = "navigation.attitude.roll"
      const valueRoll = values['roll']
      const timestamp = signalkTimestamp

      const pathPitch = "navigation.attitude.pitch"
      const valuePitch = values['pitch']

      const pathYaw = "navigation.attitude.yaw"
      const valueYaw = values['yaw']

      influxFormat(pathRoll,valueRoll,timestamp,options)
      influxFormat(pathPitch,valuePitch,timestamp,options)
      influxFormat(pathYaw,valueYaw,timestamp,options)
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
      const tags = {"vesselname":vesselname}
      const fields = {"value":values}
      const timestamp = Date.parse(signalkTimestamp)
      const metric = {measurement,tags,fields,timestamp}

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
    return (localSubscription = {
      "context" : "vessels.self",
      "subscribe" : subscribeArray
    })
  }


  let _start = function(options) {
    app.debug(`${plugin.name} Started...`)
    const defaultTags = {}


    //Set Variables from plugin options
    const url = options["influxHost"]
    const token = options["influxToken"]
    const org = options["influxOrg"]
    const bucket = options["influxBucket"]
    const writeOptions = options["writeOptions"]

    options.defaultTags.forEach(tag => {
    	defaultTags[tag["tagName"]]=tag["tagValue"]
    	app.debug(defaultTags)

    })


    const writeApi = new InfluxDB({
    	url,
    	token})
    		.getWriteApi(
    			org,
    			bucket,
    			'ms',
    			writeOptions)

    writeApi.useDefaultTags(defaultTags)

    //writeApi.useDefaultTags({vesselname: app.getSelfPath('name')})

    //const influxdb = new Influxdb({
      //host: options.influxHost,
      //token: options.influxToken 
      //})
//
//
    //influxUploadTimer = setInterval(function() {
      //app.debug (`Sending ${metricArray.length} metrics to be uploaded to influx`)
      //if (metricArray.length != 0) {
        //influxPost(options,influxdb,metricArray)
        //bufferArray = metricArray
        //metricArray = []
      //}
      //}
      //, options.uploadFrequency)
    //app.debug (`Interval Started, upload frequency: ${options.uploadFrequency}ms`)

    app.subscriptionmanager.subscribe(
      _localSubscription(options),
      unsubscribes,
      subscriptionError => {
        app.error('Error:' + subscriptionError);
      },
      delta => {
        delta.updates.forEach(u => {
          //if no u.values then return as there is no values to display
          if (!u.values) {
            return
          }

          const path = u.values[0].path
          const values = u.values[0].value
          const timestamp = u.timestamp

          if (signalkPathCheck(path) == true) {

            modifyPath(path,values,timestamp,options)
          }
          else {
            if (isNaN(values)) {
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
	            "title":"Influxdb2.0 Host URL"
	         },
	         "influxToken":{
	            "type":"string",
	            "title":"Influxdb2.0 Token"
	         },
	         "influxOrg":{
	            "type":"string",
	            "title":"Influxdb2.0 Organisation"
	         },
	         "influxBucket":{
	            "type":"string",
	            "title":"Influxdb2.0 Bucket"
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
	                  "default": 1000	           
	               },
	               "flushInterval":{
	                  "type":"number",
	                  "title":"Flush Interval",
	                  "default": 30000
	               },
	               "maxBufferLines":{
	                  "type":"number",
	                  "title":"Maximum Buffer Lines",
	                  "default": 32000
	               },
	               "maxRetries":{
	                  "type":"number",
	                  "title":"Maximum Retries",
	                  "default": 3
	               },
	               "maxRetryDelay":{
	                  "type":"number",
	                  "title":"Maximum Retry Delay",
	                  "default": 5000
	               },
	               "minRetryDelay":{
	                  "type":"number",
	                  "title":"Minimum Retry Delay",
	                  "default": 180000
	               },
	               "retryJitter":{
	                  "type":"number",
	                  "title":"Retry Jitter",
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
