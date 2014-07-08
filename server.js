var casper = require('casper').create();
var args = casper.cli.args;
var fs = require('fs');

if(args.length != 1) { casper.exit(); }
var campaign = {
	'id': args[0],
	'complete': false,
	'timer': 0,
	'limit': 100
};

var availableActions = {
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
	if(availableActions[nodeName] && availableActions[nodeName].actions) {
		actions = addActions(actions, availableActions[nodeName].actions);
	}
	var attributes = el.attributes;
	for(var i in attributes) {
		if(availableActions[nodeName] && availableActions[nodeName][i] && availableActions[nodeName][i].actions) {
			actions = addActions(actions, availableActions[nodeName][i].actions);
		}
		if(availableActions[nodeName] && availableActions[nodeName][i] && availableActions[nodeName][i][attributes[i]] && availableActions[nodeName][i][attributes[i]].actions) {
			actions = addActions(actions, availableActions[nodeName][i][attributes[i]].actions);
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
		casper.then( function() {

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

		});
	},

	'selectAll': function(selector, callback) {
		casper.then( function() {

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
		});
		return true;
	}

};

function main() {
	casper.wait(500, function() {
		var fileName = campaign['id'] + '.json';
		var data = '';
		if(fs.exists(fileName)) {
			data = JSON.parse(fs.read(fileName));
			for(var i in data) {
				if(!data[i].processed && data[i].command && data[i].data && commands[data[i].command]) {
					data[i].waiting = true;
					commands[data[i].command](data[i].data, function(res) {
						console.log('command: ', data[this].command, data[this].data);
						console.log('result:  ', JSON.stringify(res));
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
	});
}

casper.start();
main();
casper.waitFor(function() {
	return campaign['timer'] == campaign['limit'];
}, function then() {
	console.log('Timing out after ' + campaign['limit'] + ' tries');
});
casper.run();