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
	'BODY': ['getText'],
	'H1': ['getText']
};

var commands = {
	'open': function(url, callback) {
		//console.log('Opening ' + url);
		casper.thenOpen(url, function() {
			if(callback) { callback({'obj': this, 'text': this.getTitle()}); }
		});
		return true;
	},
	'select': function(selector, callback) {
		casper.then( function() {
			var eval = this.evaluate( function(selector) {
				return Array.prototype.map.call(document.querySelectorAll(selector), function(el) {
					return {'text': el.innerText, 'type': el.nodeName};
				});
			}, {selector: selector});
			var actions = [];
			var text = '';
			for(var i in eval) {
				if(availableActions.hasOwnProperty(eval[i].type)) {
					actions = availableActions[eval[i].type];
				}
				text += eval[i].text + '\n';
			}
			if(callback) { callback({'obj': eval, 'text': text, 'actions': actions}); }
			return eval;
		});
		return true;
	}
};

function main() {
	casper.wait(2000, function() {
		var fileName = campaign['id'] + '.json';
		var data = '';
		if(fs.exists(fileName)) {
			data = JSON.parse(fs.read(fileName));
			for(var i in data) {
				if(!data[i].processed && data[i].command && data[i].data && commands[data[i].command]) {
					data[i].waiting = true;
					commands[data[i].command](data[i].data, function(res) {
						console.log("Command processed: ", data[this].command, data[this].data);
						console.log('Actions: ', JSON.stringify(res.actions));
						console.log('---');
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