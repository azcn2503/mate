let fs       = require('fs');
let args     = process.argv;
if (args.length < 3) { process.exit(); }

class Mate2 {

	constructor() {

		this.campaign = {
			id: null,
			complete: false,
			timer: 0,
			limit: 5
		};

		this.fileName = '';
		this.data = [];
		this.step = 0;

		this.stepNames = {};
		this.stepHashes = [];

		this.args = {};
		this.mateArgs = {};

		this.webdriver = null;
		this.driver = null;

	}

	BuildDriver(type = 'phantomjs', implicitWait = 10000) {

		this.webdriver = require('selenium-webdriver');
		this.driver = new this.webdriver.Builder().withCapabilities(this.webdriver.Capabilities[type]()).build();
		this.driver.manage().timeouts().implicitlyWait(implicitWait);

	}

	InjectArguments() {

		for (let i = 3; i < args.length; i++) {
			if(!args[i] || args[i].indexOf('--') == -1) { break; }
			var kvp = args[i].match(/--(.+?)=(.+)/);
			var k = kvp[1].replace(/[\"\=]/g, '').trim();
			var v = kvp[2].replace(/[\"\=]/g, '').trim();
			this.args[k] = v;
		}

		if (!this.args['generation']) {
			this.args['generation'] = 0;
		}

	}

	SetCampaign(campaign) {

		this.campaign.id = campaign;
		this.fileName = campaign + (!/\.json$/.test(campaign) ? '.json' : '');

	}

	Load() {

		let content = fs.readFileSync(this.fileName, {'encoding': 'utf-8'});

		if(content.length == 0) {
			this.WaitForCommands();
			return false;
		}

		let data = JSON.parse(content);
		for (let i in data) {
			if (!this.data[i]) {
				this.data[i] = data[i];
			}
		}

		this.step = 0;
		this.ProcessCommand();

		return true;

	}

	Save(fileName = `${this.campaign.id}-${Date.now() + Math.random().toString().replace(/\./, '0')}.json`) {

	}

	Retry() {

		this.step = 0;
		this.Load();

	}

	ProcessCommand() {

		let command = this.data[this.step];

		// replace variables in data with mate variables
		let exp = /\{\{args.mate.(.+?)(\((.+)\)){0,1}\}\}/gi;
		let commandStr = JSON.stringify(this.data[this.step]);
		let matches = exp.exec(commandStr);
		if (matches) {
			while (1) {
				let key = matches[1];
				if (!this.mateArgs[key]) { break; }
				let data = matches[3] || null;
				this.data[this.step] = JSON.parse(commandStr.replace(exp, this.mateArgs[key](data)));
				break;
			}
		}

		// replace variables in data with variables from command line
		for (let i in this.args) {
			let exp = new RegExp('\{\{args\.' + i + '\}\}', 'g');
			this.data[this.step] = JSON.parse(JSON.stringify(this.data[this.step]).replace(exp, this.args[i]));
		}

		if(typeof(command) !== 'object' || !command.command) {
			this.WaitForCommands();
			return false;
		}

		command.processed = command.processed || false;

		if(command.name) {
			this.stepNames[command.name] = this.step;
		}

		// Replace a fromStep name with a fromStep number, if available
		if (command.data && command.data.fromStep && typeof(command.data.fromStep) == 'string') {
			if (this.stepNames[command.data.fromStep]) {
				this.data[this.step].data.fromStep = this.stepNames[command.data.fromStep];
			}
		}

		// Skip this step if it has already been processed, or if it is a setup step
		if(command.setup || (command.processed && !this.forceRetry)) {
			this.ProcessNextCommand();
			return false;
		}

		console.log(`Processing command: "${command.command}" with data: ${JSON.stringify(this.data[this.step])}`);

		// Execute the command
		commands.Run(command.command, this.data, this.step, (res) => {
			this.CommandProcessed(res);
		});

		return true;

	}

	ProcessNextCommand(reason = '') {

		if (reason != '') { 
			console.log(`Processing next command because: ${reason}`);
		}

		this.step++;

		if(this.step >= this.data.length) {
			this.WaitForCommands();
			return false;
		}
		this.ProcessCommand();
		return true;

	}

	CommandProcessed(res = {}) {

		let command = this.data[this.step];
		command.output = command.output || true;
		this.data[this.step].processed = true;
		this.data[this.step].result = res;

		if (command.output) {
			console.log(JSON.stringify(res));
		}
		console.log('---');

		if (command.command == 'done') {
			this.Done();
			return true;
		}

		this.ProcessNextCommand('Command processed');

	}

	Done() {

		if (this.driver) { this.driver.quit(); }

	}

	WaitForCommands(reason = '') {

		if (reason != '') { 
			console.log(`Waiting for commands because: ${reason}`);
		}

		this.campaign.timer++;

		setTimeout( () => {
			this.Retry();
		}, 1000);

	}

	RegisterMateArg(name, func) {

		this.mateArgs[name] = func;

	}

}

let mate = new Mate2();
mate.SetCampaign(args[2]);
mate.InjectArguments();
mate.RegisterMateArg('random', () => { return Math.random(); });
mate.RegisterMateArg('time', () => { return Date.now(); });
mate.RegisterMateArg('eval', (script) => { return eval(script); });
let commands = require('./mate-commands').commands;
commands.Attach(mate);
mate.Load();