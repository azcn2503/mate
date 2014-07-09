var casper = require('casper').create();
var args = casper.cli.args;
var fs = require('fs');

/*var exec = require('child_process').exec;
var execFile = require('child_process').execFile;
var spawn = require('child_process').spawn;

var child = spawn('mongo', ['mate', '--port', '3001']);
child.stdout.on('data', function(data) {
	console.log('MongoDB: ', data);
});*/

if(args.length != 1) { casper.exit(); }

var campaign = {
	'id': args[0],
	'complete': false,
	'timer': 0,
	'limit': 100
};

var nodeNameActions = {
	'A': {
		'actions': ['getText'],
		'href': {
			'actions': ['click']
		}
	},
	'BODY': {
		'actions': ['getText']
	},
	'DIV': {
		'actions': ['getText']
	},
	'H1': {
		'actions': ['getText'],
		'class': {
			'assistive-text section-heading': {
				'actions': ['test']
			}
		}
	},
	'INPUT': {
		'type': {
			'text': {
				'actions': ['sendKeys', 'getValue']
			},
			'button': {
				'actions': ['click', 'getValue']
			}
		}
	}
};

var addActions = function(target, source) {
	for(var i in source) {
		target.push(source[i]);
	}
	return target;
}; 

var processActions = function(el) {
	if(!el) { return false; }
	var actions = [];
	var nodeName = el.nodeName;
	if(nodeNameActions[nodeName] && nodeNameActions[nodeName].actions) {
		actions = addActions(actions, nodeNameActions[nodeName].actions);
	}
	var attributes = el.attributes;
	for(var i in attributes) {
		if(nodeNameActions[nodeName] && nodeNameActions[nodeName][i] && nodeNameActions[nodeName][i].actions) {
			actions = addActions(actions, nodeNameActions[nodeName][i].actions);
		}
		if(nodeNameActions[nodeName] && nodeNameActions[nodeName][i] && nodeNameActions[nodeName][i][attributes[i]] && nodeNameActions[nodeName][i][attributes[i]].actions) {
			actions = addActions(actions, nodeNameActions[nodeName][i][attributes[i]].actions);
		}
	}
	return actions;
};

var commands = {

	'click': function(selector, callback) {
		casper.then( function() {
			this.click(selector);
			if(callback) { callback({'url': this.getCurrentUrl()}); }
		});
	},

	'open': function(url, callback) {
		casper.thenOpen(url, function() {
			if(callback) { callback({'url': this.getCurrentUrl()}); }
		});
		return true;
	},

	'select': function(selector, callback) {
		casper.waitForSelector(selector, function then() {

			var el = this.evaluate( function(selector) {
				var el = document.querySelector(selector);
				var attributes = {};
				for(var i in el.attributes) {
					if(el.attributes[i].nodeType != 2) { continue; }
					attributes[el.attributes[i].nodeName] = el.attributes[i].value;
				}
				return {'innerText': el.innerText, 'attributes': attributes, 'nodeName': el.nodeName};
			}, {selector: selector});

			if(!el) { return false; }
			el.actions = processActions(el);

			if(callback) { callback(el); }

		}, function timeout() {

			if(callback) { callback(null); }

		});
	},

	'selectAll': function(selector, callback) {
		casper.waitForSelector(selector, function then() {

			var els = this.evaluate( function(selector) {
				return Array.prototype.map.call(document.querySelectorAll(selector), function(el) {
					var attributes = {};
					for(var i in el.attributes) {
						if(el.attributes[i].nodeType != 2) { continue; }
						attributes[el.attributes[i].nodeName] = el.attributes[i].value;
					}
					return {'innerText': el.innerText, 'attributes': attributes, 'nodeName': el.nodeName};
				});
			}, {selector: selector});

			if(!els) { return false; }
			for(var i in els) {
				if(!els[i]) { continue; }
				els[i].actions = processActions(els[i]);
			}

			if(callback) { callback(els); }

		}, function timeout() {

			if(callback) { callback(null); }

		});
	},

	'scrollPageToEnd': function(data, callback) {

		casper.on('scroll', function() {

			data = data || {};
			data.prevScrollTop = data.prevScrollTop || 0;
			data.tries = data.tries || 0;
			data.tryLimit = data.tryLimit || 5;

			var scrollTop = this.evaluate( function() {
				window.scrollTo(0, document.body.scrollHeight);
				return document.body.scrollTop;
			});

			data.scrollTop = scrollTop;

			if(data.scrollTop == data.prevScrollTop) {
				data.tries++;
			}
			else {
				data.tries = 0;
			}

			data.prevScrollTop = scrollTop;

			if(data.tries >= data.tryLimit) {
				casper.emit('done', scrollTop);
				return;
			}
			else {
				casper.wait(1000, function() {
					casper.emit('scroll');
				});
			}

		});

		casper.on('done', function(scrollTop) {

			data.prevScrollTop = scrollTop;
			if(callback) { callback({'scrollTop': scrollTop}); }
			return;

		});

		casper.emit('scroll');
		return;

	}

};

function main() {

	/*
		Monitor the campaign in the database for changes
		Process those changes
		Update the database with response to those changes
		Provide output in the console so that processes monitoring this agent can take more immediate action
	*/

	casper.on('load', function() {
		fileName = campaign['id'] + '.json';
		if(!fs.exists(fileName)) { return; }
		data = JSON.parse(fs.read(fileName));
		dataLen = data.length;
		step = 0;
		casper.emit('processCommand');
	});

	casper.on('processCommand', function() {
		data[step].processed = data[step].processed || false;
		if(data[step].processed) {
			casper.emit('processNextCommand');
			return;
		}
		data[step].data = data[step].data || null;
		data[step].waiting = true;
		casper.emit('save');
		//console.log(data[step].command, data[step].data);
		commands[data[step].command](data[step].data, function(res) {
			casper.emit('commandProcessed', res);
		});
	});

	casper.on('processNextCommand', function() {
		step++;
		if(step >= dataLen) { casper.emit('waitForCommands'); return; }
		casper.emit('processCommand');
	});

	casper.on('commandProcessed', function(res) {
		console.log(JSON.stringify(res));
		data[step].waiting = false;
		data[step].processed = true;
		casper.emit('save');
		step++;
		if(step >= dataLen) { casper.emit('waitForCommands'); return; }
		casper.emit('processCommand');
	});

	casper.on('save', function() {
		fs.write(fileName, JSON.stringify(data), 'w');
	});

	casper.on('waitForCommands', function() {
		casper.wait(1000, function() {
			casper.emit('load');
		});
	});

	casper.emit('load');

	/*casper.wait(500, function() {

		var fileName = campaign['id'] + '.json';
		var data = '';
		if(fs.exists(fileName)) {
			data = JSON.parse(fs.read(fileName));
			for(var i in data) {
				if(!data[i].processed && data[i].command && commands[data[i].command]) {
					if(data[i].waiting) { continue; }
					console.log('Running command...');
					data[i].data = data[i].data || null;
					data[i].waiting = true;
					commands[data[i].command](data[i].data, function response(res) {
						casper.emit('commandProcessed');
						//console.log('command: ', data[this].command, data[this].data);
						//console.log('result:  ', JSON.stringify(res));
						console.log(JSON.stringify(res));
						commandProcessed = true;
						data[this].processed = true;
						data[this].waiting = false;
						fs.write(fileName, JSON.stringify(data), 'w');
						main();
					}.bind(i));
					fs.write(fileName, JSON.stringify(data), 'w');
				}
			}
		}
		//console.log(campaign['timer']);
		campaign['timer']++;
		if(campaign['timer'] == campaign['limit'] || campaign['complete']) { return; }
		// Try again
		main();

	});*/

}

casper.start();
main();
casper.run();