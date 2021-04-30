# signalk-to-influxdb-v2-buffering
 Plugin that saves data to an influxdbv2 database - buffers data without internet connection

The plugin is designed to do batch writes to a cloud hosted influxdb2.0 data base. The Plugin now uses the https://github.com/influxdata/influxdb-client-js library.
 If the conenction to the influxdb is down the batch of metrics should be buffered and re uploaded when the internet connection is re-established

## Influx Measurement format
It is storing the metrics in the following format eg: 

```
propulsion.port.transmission.oilPressure = 30.0
navigation.position.latitude = -19.26
```

The field is always 'value'


## Paths Supported
Currently the pulgin is only supporting all paths that have a numrical value (also position and attitude).


## Config Parameters

### Influxdb2.0 Host URL
the url to your cloud hosted influxb2.0
```https://us-west-2-1.aws.cloud2.influxdata.com```

### Influxdb2.0 Token
the token for your cloud hosted influxb2.0 bucket
```somesecrettoken```

### Influxdb2.0 Organisation
your influxdb2.0 organistion
```typically your email```

### Influxdb2.0 Bucket
which bucket you are storing the metrics in
```yourvesseldatabucket```

### full path to directory where the buffer should be stored (note no at end of dir)
the absolute path to the directory where you want to store your buffer, ensure there is no trailing / at the end
```/home/pi/signalkbuffer```

### Influx Write Options

#### Batch Size
the maximum points/line to send in a single batch to InfluxDB server

#### Flush Interval
maximum time in millis to keep points in an unflushed batch, 0 means don't periodically flush

#### Max Buffer Lines
maximum size of the retry buffer - it contains items that could not be sent for the first time

#### Max Retries
maximum delay between retries in milliseconds

#### Max Retry Delay 
maximum delay between retries in milliseconds

#### Min Retry Delay
minimum delay between retries in milliseconds

#### Retry Jitter
a random value of up to retryJitter is added when scheduling next retry

### Default Tags
an array of default tags to add to every point

#### Tag Name
Name of the tag

#### Tag Value
Value of the tag
