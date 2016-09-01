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

	}

	SetCampaign(campaign) {

		this.campaign.id = campaign;

	}

	Load(fileName = `${this.campaign.id}.json`) {

		let content = fs.readFileSync(fileName, {'encoding': 'utf-8'});

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

		let mateArgs = {
			'time': () => { return Date.now(); },
			'random': () => { return Math.random(); }
		};

		// replace variables in data with mate variables
		for (let i in Object.keys(mateArgs)) {
			let key = Object.keys(mateArgs)[i];
			let exp = new RegExp('{{args\.mate\.' + key + '}}', 'g');
			this.data[this.step] = JSON.parse(JSON.stringify(this.data[this.step]).replace(exp, mateArgs[key]()));
		}

		// replace variables in data with variables from command line
		for (let i in this.args) {
			let exp = new RegExp('{{args\.' + i + '}}', 'g');
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

		if(command.setup || (command.processed && !this.forceRetry)) {
			this.ProcessNextCommand();
			return false;
		}

		console.log(`Processing command: ${command.command}`);

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

}

let mate = new Mate2();
mate.SetCampaign(args[2]);
mate.InjectArguments();
let commands = require('./mate-commands').commands;
commands.Attach(mate);
mate.Load();