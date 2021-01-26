const fs = require('fs');
const path = require('path');
const debug = require('debug')('signalk-to-influxdb-v2-buffering')


exports.buffer= function(metrics,options) {
	let data = JSON.stringify(metrics)
	let filename = Date.now()
	fs.writeFileSync(`${options.bufferDirectory}/${filename}.json`, data);
	debug(`Saving buffer to ${filename}`)
	console.log(`Saving buffer to ${filename}`)
}

exports.loadBuffer= function(options) {
//joining path of directory 
	const fileArray = []
	const directoryPath = options.bufferDirectory;
	//passsing directoryPath and callback function
	files = fs.readdirSync(directoryPath) 
	//console.log(files)
	if (files.length == 0) {
		debug('No Files in Buffer')
		console.log('No Files in Buffer')
		return false
	}
	else {
		return files
	}
}




exports.sendBuffer= function(filenames,options) {
	var metrics = []
	filenames.forEach(function (file) {
		const thisfile = fs.readFileSync(`${options.bufferDirectory}/${file}`, 'utf8')
  		metrics.push(...JSON.parse(thisfile));
	});
	
	for (const file of filenames) {
        fs.unlink((`${options.bufferDirectory}/${file}`), err => {
            if (err) throw err;
        });
    };

	return metrics
}