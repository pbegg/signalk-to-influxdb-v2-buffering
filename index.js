
const Influxdb = require('influxdb-v2');
const buffer = require('./buffer.js')




module.exports = function (app) {
  var plugin = {};

  plugin.id = 'signalk-to-influxdb-v2-buffer';
  plugin.name = 'Signalk To Influxdbv2.0';
  plugin.description = 'Plugin that saves data to an influxdbv2 database - buffers data without internet connection';

  var unsubscribes = [];



  

  let timerId;

  function influxPost(options,influxdb,metrics) {
    influxdb.write(
      {
        org: options.influxOrg, // [Required] your organization. You can set `orgID` if you prefer to use the ID
        bucket: options.influxBucket, // [Required] your bucket
        precision: 'ms' // precision of timestamp. Can be `ns` (nanoseconds), `us` (microseconds), `ms` (milliseconds) or `s` (seconds). The default is `ns`
      },
      metrics,
    )
    .then(resp => {
      app.debug(resp + 'Successfully uploaded')
      bufferResult = buffer.loadBuffer(options) 
      if (bufferResult == false) {
        return
      }
      else {      
        app.debug('There are files in the buffer')
        app.debug(JSON.stringify(bufferResult))
        influxPost(options,influxdb,buffer.sendBuffer(bufferResult,options))
      }

    })
    .catch(err => {
      // Handle errors
        buffer.buffer(bufferArray,options)
        bufferArray= []
        app.debug(`bufferring metrics because ${err.message}`);
        const bufferResult = buffer.loadBuffer(options)
        if (bufferResult != false) {
          app.debug(`There are ${bufferResult.length} files in the buffer`)
        }
    })
    
  }

  function influxformat(path,values,signalkTimestamp,options) {
    if (values == null){
      values = 0
    }
    //Set variables for metric
    let measurement = ''
    const tags = {}
    const fields = {}

    //Define Static Tags
    tags.vesselname=options.vesselname

    //Get correct measurement based on path. It is the base of the path
    const pathArray = path.split('.')
    
    //propulsion path
    if (pathArray[0] == 'propulsion') {
      measurement = pathArray[0]
      tags.engine = pathArray[1]
      timestamp = Date.parse(signalkTimestamp)
      if (pathArray.length == 3) {
          fields[pathArray[2]]=values
      }
      if (pathArray.length > 3) {
          tags.component=pathArray[2]
          fields[pathArray[pathArray.length-1]]=values
      }    
    }
    //navigation path
    if (pathArray[0] == 'navigation') {
        measurement = pathArray[0]
        timestamp = Date.parse(signalkTimestamp)
        if (pathArray.length == 2) {
            if (pathArray[1]  == "position") {
                fields.latitude=values['latitude']
                fields.longitude=values['longitude']
            }
            if (pathArray[1]  == "attitude") {
                fields.roll=values['roll']
                fields.pitch=values['pitch']
                fields.yaw=values['yaw']
            }
            if (pathArray[1]  != "position") {
              fields[pathArray[1]]=values
            }

        }
        if (pathArray.length > 2) {
            tags.context=[pathArray[1]]
            fields[pathArray[-1]]=values.value

        }
    }



    const metric = {measurement,tags,fields,timestamp}
    return metric
  }

  plugin.start = function (options, restartPlugin) {

    app.debug('Plugin started');

    metricArray = []
    bufferArray = []

    const filterPaths = require(options.pathFile)
    
    
    options.vesselname = app.getSelfPath('name')
    
    const influxdb = new Influxdb({
    host: options.influxHost,
    token: options.influxToken 
    })
    


    timerId = setInterval(() => {
      app.debug (`Sending ${metricArray.length} metrics to be uploaded to influx`)
      if (metricArray.length != 0) {
        influxPost(options,influxdb,metricArray)
        bufferArray = metricArray
        metricArray = []
      }

    }
      , options.uploadFrequency)
    app.debug (`Interval Started, upload frequency: ${options.uploadFrequency}ms`)


    let localSubscription = {
      context: '*', // Get data for all contexts
      subscribe: filterPaths
    };


    app.subscriptionmanager.subscribe(
      localSubscription,
      unsubscribes,
      subscriptionError => {
        app.error('Error:' + subscriptionError);
      },
      delta => {
        if (!delta.updates) {
          return;
        }
        delta.updates.forEach(u => {
          if (!u.values) {
            return;
          }
          const path = u.values[0].path
          const values = u.values[0].value
          const timestamp = u.timestamp

          const metric = influxformat(path,values,timestamp,options)
          metricArray.push(metric)
        })
      }
    );
  };

  plugin.stop = function () {
    unsubscribes.forEach(f => f());
    unsubscribes = [];
    clearInterval(timerId)
    app.debug('Interval Timer Stopped')
    app.debug('Plugin stopped');

  };

  plugin.schema = {
    type: 'object',
    required: [
      'influxHost',
      'influxToken', 
      'influxOrg',
      'influxBucket',
      'bufferDirectory',
      'pathsFile',
      'uploadFrequency'
    ],
    properties: {
      "influxHost": {
        type: 'string',
        title: 'influx host url'
      },
      "influxToken": {
        type: 'string',
        title: 'influx token'
      },
      "influxOrg": {
        type: 'string',
        title: 'influx organisation'
      },
      "influxBucket": {
        type: 'string',
        title: 'influx bucket'
      },
      "bufferDirectory": {
        type: 'string',
        title: 'full path to directory where the buffer should be stored',
        default: '/home/pi/'
      },
      "pathFile": {
        type: 'string',
        title: 'full path to the filterPaths.json file'
      },
      "uploadFrequency": {
        type: 'number',
        title: 'Frequency of batched write to influx in ms',
        default: 30000
      }

    }
  };

  return plugin;
};