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
	'limit': 5
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
		var returns = {'url': null };
		casper.waitForSelector(selector, function then() {
			this.click(selector);
			casper.waitFor(commands.checkDocumentReadyState, function then() {
				if(callback) {
					returns.url = this.getCurrentUrl();
					callback(returns);
				}
			});
		}, function fail() {
			if(callback) {
				callback(returns);
			}
		});
	},

	'done' : function(data, callback) {

		if(callback) { callback({'done': true}); }

	},

	'open': function(url, callback) {
		casper.thenOpen(url, function() {
			if(callback) { callback({'url': this.getCurrentUrl()}); }
		});
		return true;
	},

	'screenshot': function(filename, callback) {

		filename = filename || new Date().getTime() + Math.random().toString().replace(/\./, '0') + '.png';
		filename = 'screenshots/' + filename;

		casper.capture(filename);

		if(callback) { callback({'filename': filename}); }

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

			if(callback) { callback({'element': el}); }

		}, function timeout() {

			if(callback) { callback({'element': null}); }

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

			if(callback) { callback({'elements': els}); }

		}, function timeout() {

			if(callback) { callback({'elements': null}); }

		});
	},

	'sendKeys': function(data, callback) {

		casper.waitForSelector(data.selector, function then() {

			this.sendKeys(data.selector, data.string);

			if(callback) { callback(true); }

		});

	},

	'submitForm': function(selector, callback) {

		casper.waitForSelector(selector, function then() {

			this.evaluate( function(selector) {
				document.querySelector(selector).submit();
			}, {selector: selector});

			if(callback) { callback(true); }

		});

	},

	'scrollPageToEnd': function(data, callback) {

		var data = data || {};

		casper.on('scrollPageToEnd.scroll', function() {

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
				casper.emit('scrollPageToEnd.done', scrollTop);
				return;
			}
			else {
				casper.wait(1000, function() {
					casper.emit('scrollPageToEnd.scroll');
				});
			}

		});

		casper.on('scrollPageToEnd.done', function(scrollTop) {

			casper.unwait();
			data.prevScrollTop = scrollTop;
			if(callback) { callback({'scrollTop': scrollTop}); }
			return;

		});

		casper.emit('scrollPageToEnd.scroll');
		return;

	},

	'checkDocumentReadyState': function() {

		var readyState = casper.evaluate(function() {
			return document.readyState == 'complete';
		});
		return readyState;

	}

};

function main() {

	/*
		Monitor the campaign in the database for changes
		Process those changes
		Update the database with response to those changes
		Provide output in the console so that processes monitoring this agent can take more immediate action
	*/

	casper.on('main.load', function() {
		fileName = campaign['id'] + '.json';
		if(!fs.exists(fileName)) { return; }
		data = JSON.parse(fs.read(fileName));
		dataLen = data.length;
		step = 0;
		casper.emit('main.processCommand');
	});

	casper.on('main.processCommand', function() {
		data[step].processed = data[step].processed || false;
		if(data[step].processed) {
			casper.emit('main.processNextCommand');
			return;
		}
		data[step].data = data[step].data || null;
		data[step].waiting = true;
		casper.emit('main.save');
		commands[data[step].command](data[step].data, function(res) {
			casper.emit('main.commandProcessed', res);
		});
	});

	casper.on('main.processNextCommand', function() {
		step++;
		if(step >= dataLen) { casper.emit('main.waitForCommands'); return; }
		casper.emit('main.processCommand');
	});

	casper.on('main.commandProcessed', function(res) {
		res.command = data[step].command;
		console.log(JSON.stringify(res));
		data[step].waiting = false;
		data[step].processed = true;
		casper.emit('main.save');
		if(data[step].command == 'done') { casper.emit('main.done'); return; }
		casper.emit('main.processNextCommand');
	});

	casper.on('main.save', function() {
		fs.write(fileName, JSON.stringify(data, null, 2), 'w');
	});

	casper.on('main.waitForCommands', function() {
		campaign.timer++;
		//if(campaign.timer >= campaign.limit) { casper.emit('main.done'); return; }
		casper.wait(1000, function() {
			casper.emit('main.load');
		});
	});

	casper.on('main.done', function() {
		casper.exit();
	});

	casper.emit('main.load');

}

casper.start();
main();
casper.run();