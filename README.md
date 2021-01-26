# signalk-to-influxdb-v2-buffering
 Plugin that saves data to an influxdbv2 database - buffers data without internet connection

The plugin is designed to do batch writes to a cloud hosted influxdb2.0 data base. If the conenction to the influxdb is down the batch of metrics is saved to disc in JSON format. Once the next successful write is completed it will load all the buffered files and send them as one large batch to influxdb.

## Influx Measurement format
It is storing the metrics in the following format eg: 
propulsion.port.transmission.oilPressure = 30.0

```
{
	"measurement": 'propulsion'
	"tags": {
		"engine": "port",
		"component": "transmission",
		"vesselname": "self.name"
	},
	"fields" : {
		oilPressure: 30.0
	},
	timestamp: 1611618842558

```


## Paths Supported
Currently the pulgin is only supporting 'navigation' and 'propulsion' paths.


## Config Parameters

# Influxdb2.0 Host URL
the url to your cloud hosted influxb2.0
```us-west-2-1.aws.cloud2.influxdata.com```

# Influxdb2.0 Token
the token for your cloud hosted influxb2.0 bucket
```somesecrettoken```

# Influxdb2.0 Organisation
your influxdb2.0 organistion
```typically your email```

# Influxdb2.0 Bucket
which bucket you are storing the metrics in
```yourvesseldatabucket```

# full path to directory where the buffer should be stored (note no at end of dir)
the absolute path to the directory where you want to store your buffer, ensure there is no trailing / at the end
```/home/pi/signalkbuffer```

# full path to the filterPaths.json file
instead of selecting all the paths you want to subscribe to inside the plugin config, this is the path to your filterPaths.json file see file in repo for an example.

To select all paths make your filterPaths.json represent the below
```
[{
      path: '*', // Get all paths
      period: 5000 // Every 5000ms
    }]
    ```
# Frequency of batched write to Influxdb2.0 in ms
how often you want to send the batch writes to influx