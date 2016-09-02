# Mate Server

## Introduction

Mate is a website automation framework built around Selenium. It can be used for business process automation, website testing, scraping, and a whole load of other things. You tell the program what commands you want to run on the page and Mate will run them sequentially, akin to Selenese. The commands are simple to use and understand. 

Mate is still under development and was recently opened for public consumption (August 2016). Please feel free to contribute!

## Prerequisites

* PhantomJS or ChromeDriver
* Node.js version 6 or above

Run the following command to check your Node.js version:

    node --version

Verify that you Node.js is at least version 6. If not, download it from http://www.nodejs.org or use your distributions package manager to obtain it if you're running Linux.

Clone the repository to some folder on your system then `cd` to it.

Run the following command to make sure all the required packages are installed and up to date:

    npm install

Once this completes, you should be ready to roll!
    
## Usage

You will need to create a campaign file before you run Mate for the first time. A campaign file is simply a JSON file containing one array with one or more steps objects.

Check out the following `google.json` campaign file. This file tells the Mate application what to do with a webpage:

    [
        {
            "command": "open",
            "data": "http://www.google.com"
        },
        {
            "command": "search",
            "data": "Aaron Cunnington"
        },
        {
            "command": "selectAll",
            "data": "h3.r > a"
        },
        {
            "command": "getAttributeValues",
            "data": "href"
        },
        {
            "command": "done"
        }
    ]

You can process it by running:

    node main.js google

You will see the results output to the console as Mate runs the commands.
    
### Campaign Files

Campaign files like the one above are simply JSON files with various steps (commands and accompanying data) instructing the mate application what to do. 

Every step must have a `command` string, and optionally a mixed `data` object, like this:

    {
        "command": "open",
        "data": "www.google.com"
    }

Some commands require that `data` be an object with mixed content, like the `getAttributeValues` command

Steps that require data from previously executed steps will allow a `fromStep` property, you can follow this with either the step number (first step is 0, second step is 1, etc.). If no step number is provided, the result data from the previous step will be used by default.

When a campaign file is saved it will save additional information against each step, like so:

    {
        "command": "open",
        "data": "www.google.com",
        "result": {
            "success": true
        },
        "waiting": false,
        "processed": true,
        "step": 0
    }

`result` contains the output from the command, it can be various things, but usually will contains `success` denoting whether the command failed or succeeded.

`waiting` and `processed` manage the state of the command. You can re-run a command by changing `processed` to false. `waiting` is true when the command is started, and false when the command completes. `processed` is false always except when the command is completed.

`step` tells you the step number of the command. Each step is executed sequentially.

#### Saving

You can save your campaign simply by passing the `done` command with an optional filename. If a filename is not specified then the original campaign file will be overwritten. You probably don't want to overwrite your campaign file if you are using variables!

For our above example we might do this:

    {
        "command": "done",
        "data": "google-output"
    }

And it will save as `google-output.json`.

#### Variables

You can specify variables in your campaign template like so:

    {
        "command": "open",
        "data": "http://www.mywebpage.com/user/{{args.username}}"
    }

All variables should be prefixed with `args.` as demonstrated above.

Be sure to start the application like this:

    node main.js campaignfile --username=businessguy

If you run a campaign file from within another campaign using the `runCampaign` command, it will by default pass the result data from the previous command as the variable `{{args.initial}}`.

There are some dynamic variables you can use:

    {{args.mate.time}} - The time in milliseconds
    {{args.mate.random}} - A random number
    
### Commands

#### assert
**data**: {`fromStep int`, `usingExpression array`, `operator string`, `expected mixed`}

Assert that the requested data matches the `expected` value compared by the `operator`.

`operator` can be one of the following: `equal` compares if they are the same, `gt` compares if the actual is greater than the expected, `gte` compares if the actual is greater than or equal to the expected, `lt` compares if the actual is less than the expected, `lte` compares if the actual is less than or equal to the expected, `null` compares if the actual is null, `notnull` compares if the actual is not null, `contains` compares if the actual contains the expected value, `notcontains` compares if the actual does not contain the expected value, `inrange` checks if the data is within the range specified (use a string like "1-2" or "3-7")

Example 1:

    {
        "command": "assert",
        "data": {
            "fromStep": 1,
            "fromIndex": 0,
            "operator": "equal",
            "expected": "anjunabeats"
        }
    }

Will assert that the data from step 1 at index 0 (first entry in the array) is equal to `anjunabeats`. 

Example 2:

    {
        "command": "assert",
        "data": {
            "fromStep": 1,
            "operator": "contains",
            "expected": "mywebsitename.com"
        }
    },
    {
        "command": "assert",
        "data": {
            "fromStep": 2,
            "fromIndex": ["reason", "index"],
            "operator": "inrange",
            "expected": "0-2"
        }
    }

Might be used in Google search results to assert that data gathered from a previous step contains your website address. The second assertion verifies that the result is in the top three. Asserting assertions is OK!

Returns: { 'assert': bool, 'reason': { 'message': string, 'expected': string, 'actual': string, 'index': mixed } }

---

#### click
**data**: `CSS Selector string`

Clicks an element defined by the CSS selector string.

Example:

    {
        "command": "click",
        "data": "input[type=submit]"
    }

---

#### commands
**data**: [array of commands]

You can nest commands within other commands and they will execute sequentially, like this:

    {
        "name": "clickButtons",
        "command": "commands",
        "data": [
            {
                "command": "click",
                "data": "button"
            },
            {
                "command": "click",
                "data": "input[type=submit]"
            }
        ]
    }

Will click a button, then click a submit button.

---

#### done
**data**: `fileName string`

Completes the campaign and ends the node and browser processes. You can optionally specify the filename that the campaign file will be saved as. If a filename is not specified, it will overwrite the original campaign file. The file extension `.json` will automatically be added if it is not present.

---

#### eval
**data**: { `fromStep int`, `usingExpression array`, `eval string` }

Evaluates JavaScript against a set of results returned by `getAttributeValues`. The result data takes the context of `this` when evaluated.

Example:

    {
        "command": "evalEach",
        "data": {
            "fromStep": 1,
            "usingExpression": ["*", "/^te/"],
            "eval": "return JSON.stringify(this);"
        }
    }
    
Returns a JSON stringified array of the current set of results.

---

#### extractTable
**data**: { `selector string`, `options object` }

Extracts content from a table defined by the CSS selector and can output it in JSON or CSV format. It accepts the following settings for options:

**colCountMode** defines the method used for counting the number of columns in the table. This defaults to 'auto' which will try to automatically work out the number of columns based on the structure of the table. You can also set it to 'th' which will simply count the number of table headings (it will only count the first occurrence of headings).

**headings** defines the actual headings. The default is 'auto' which will use the content from the table headings. You can set it to an array of strings that will overwrite any detected headings.

**output** defines the output format of the table content. It defaults to 'json' but you can also set it to 'csv'. It is trivial for you to be able to save the content using the save command in csv format and open it in your favourite spreadsheet editor.

The following code will extract a table called 'products', will use the headings 'Product Name' and 'Product Price', and will return the content as a csv file. Assuming it is step 1, we can save the output to a file for later:

    {
        "command": "extractTable",
        "data": {
            "selector": "table#products",
            "options": {
                "headings": ["Product Name", "Product Price"],
                "output": "csv"
            }
        }
    },
    {
        "command": "save",
        "data": {
            "fromStep": 1,
            "fileName": "products.csv"
        }
    }

---

#### getAttributeValues
**data**: { `fromStep int`, `attributeName mixed`, [`matchingExpression mixed`, [`matchingExpressionFlags mixed`, [`kvp mixed`]]] }

Returns attribute values from attribute names from the step defined by `fromStep`. `attributeName` can be a string, or an array of strings. You can optionally specify a regular expression to match against using `matchingExpression`, and provide flags with `matchingExpressionFlags`. If you specify an array of strings for `attributeName` and wish to match expressions against them individually, then you should use an array of strings for `matchingExpression` and `matchingExpressionFlags` also; the indexes of these arrays should match up.

Example:

    {
        "command": "getAttributeValues",
        "data": {
            "fromStep": 1,
            "attributeName": "innerHTML",
            "matchingExpression": "Anjunadeep",
            "matchingExpressionFlags": "i"
        }
    }
    
This will return all the innerHTML attribute values that match the regular expression `/Anjunadeep/i`

Example:

    {
        "command": "getAttributeValues",
        "data": {
            "fromStep": 1,
            "attributeName": ["innerHTML", "innerText"]
        }
    }

This will return all the innerHTML and innerText values.

Example:

    {
        "command": "getAttributeValues",
        "data": {
            "fromStep": 1,
            "attributeName": ["innerHTML", "innerText"],
            "matchingExpression": ["[0-9]", "[a-zA-Z]"
        }
    }

This will return all the innerHTML values when they contain numbers, and the innerText values when they contain letters.

**Key value pairing**

You can also group the results by key and value pairs if you provide some instructions about how to create these keys and values. The syntax for key value pairs is like this:

    "kvp": {
        "k": [
            {
                "mode": "after" | null,
                "attributeName": "attribute name",
                "matchingExpression": "regular expression",
                "matchingExpressionFlags": "flags" | "",
                "name": "something to rename the key to"
            }
        ],
        "v": [
            {
                "mode": "after" | null,
                "attributeName": "attribute name",
                "matchingExpression": "regular expression",
                "matchingExpressionFlags": "flags" | ""
            }
        ],
        "groupByKeyName": true | false
    }

You can have multiple keys and multiple values.

Setting `mode` to `"after"` means that the following item will be used as a key. Setting `groupByKeyName` to `true` groups your results when all of your keys are present in a result set.

Consider the following command:

    {
		"command": "getAttributeValues",
		"data": {
			"fromStep": 1,
			"fromIndex": 0,
			"attributeName": ["tagName", "innerText"],
			"kvp": {
				"k": [
					{
						"attributeName": "tagName",
						"matchingExpression": "TD",
						"name": "Specs"
					},
					{
						"attributeName": "tagName",
						"matchingExpression": "SPAN",
						"name": "Price"
					}
				],
				"v": [
					{
						"mode": "after",
						"attributeName": "tagName",
						"matchingExpression": "TD|SPAN"
					}
				],
				"groupByKeyName": true
			}
		}
	}

What is happening here is: all `tagName` and `innerText` attributes are being grabbed from step `1`. We are then creating a key value pair response where one of the keys will be created when the `tagName` attribute matches the expression `TD` and will be renamed to `Specs`, and the other key will be created when the `tagName` attribute matches the expression `SPAN` and will be renamed to `Price`. The values for these keys will be whatever comes *after* a `tagName` attribute matches the expression `TD|SPAN` (ie: after the keys are created). Therefore, results might look like this:

    [
    	{
    		"Specs": "Refurbished 13.3-inch MacBook Pro 2.4GHz Dual-core Intel i5 with Retina Display\nOriginally released October 2013\n13.3-inch (diagonal) Retina display; 2560x1600 resolution at 227 pixels per inch\n4GB of 1600MHz DDR3L SDRAM\n128GB flash storage1\n720p FaceTime HD camera\nIntel Iris Graphics \n",
    		"Price": "£799.00"
    	},
    	{
    		"Specs": "Refurbished 13.3-inch MacBook Pro 2.4GHz Dual-core Intel i5 with Retina Display\nOriginally released October 2013\n13.3-inch (diagonal) Retina display; 2560x1600 resolution at 227 pixels per inch\n8GB of 1600MHz DDR3L SDRAM\n256GB flash storage1\n720p FaceTime HD camera\nIntel Iris Graphics \n",
    		"Price": "£929.00"
    	},
    	...
    ]
    
Without `groupByKeyName`, the results look like this:

    [
    	{
    		"Specs": "Refurbished 13.3-inch MacBook Pro 2.4GHz Dual-core Intel i5 with Retina Display\nOriginally released October 2013\n13.3-inch (diagonal) Retina display; 2560x1600 resolution at 227 pixels per inch\n4GB of 1600MHz DDR3L SDRAM\n128GB flash storage1\n720p FaceTime HD camera\nIntel Iris Graphics \n"
    	},
    	{
    		"Price": "£799.00"
    	},
    	{
    		"Specs": "Refurbished 13.3-inch MacBook Pro 2.4GHz Dual-core Intel i5 with Retina Display\nOriginally released October 2013\n13.3-inch (diagonal) Retina display; 2560x1600 resolution at 227 pixels per inch\n8GB of 1600MHz DDR3L SDRAM\n256GB flash storage1\n720p FaceTime HD camera\nIntel Iris Graphics \n"
    	},
    	{
    		"Price": "£929.00"
    	},
    	...
    ]
    
And without any key value pairing at all, the results look like this:

    [
    	"TD",
    	"Refurbished 13.3-inch MacBook Pro 2.4GHz Dual-core Intel i5 with Retina Display\nOriginally released October 2013\n13.3-inch (diagonal) Retina display; 2560x1600 resolution at 227 pixels per inch\n4GB of 1600MHz DDR3L SDRAM\n128GB flash storage1\n720p FaceTime HD camera\nIntel Iris Graphics \n",
    	"SPAN",
    	"£799.00",
    	"TD",
    	"Refurbished 13.3-inch MacBook Pro 2.4GHz Dual-core Intel i5 with Retina Display\nOriginally released October 2013\n13.3-inch (diagonal) Retina display; 2560x1600 resolution at 227 pixels per inch\n8GB of 1600MHz DDR3L SDRAM\n256GB flash storage1\n720p FaceTime HD camera\nIntel Iris Graphics \n",
    	"SPAN",
    	"£929.00",
    	...
    ]
    
Key value pairing and grouping by key names can make working with related data much easier.

---

#### matchEach
**data**: { `fromStep int`, `matchingExpression string`, [`matchingExpressionFlags string = ''`, [`mode string = 'match'`, [`usingExpression array`]]] }

Returns data when the expression defined by `matchingExpression` is satisfied. You can optionally specify regular expression flags with `matchingExpressionFlags`.

The mode takes three values: `"full"` returns the full data when there is a match, `"array"` returns an array containing the matches and segments, and `"match"` (Default) returns only the matching text.

Example:

    {
        "command": "matchEach",
        "data": {
            "fromStep": 1,
            "usingExpression": ["*"],
            "matchingExpression": "an",
            "matchingExpressionFlags": "i",
            "mode": "full"
        }
    }
    
Returns the full value of data when the expression of `/an/i` is met.

---

#### open
**data**: `string`

Loads the webpage defined by the URL string.

Example:

    {
        "command": "open",
        "data": "http://www.google.co.uk"
    }
    
---

#### repeat
**data**: {`steps array`, `times int`}

Repeats the commands in the `steps` array by the `times` integer. The result data from all the repeated commands will be grouped in to one large result response in the repeat command instead of in each individual command.

Example:

    {
        "command": "repeat",
        "data": {
            "steps": [1, 2],
            "times": 2
        }
    }
    
Repeats commands 1 and 2 twice - they will execute in the order 1, 2, 1, 2.

You may wish to not perform the initial execution of a task being set up for repetition so that you can group up your data in the reply command. To do this, you can mark a command for 'setup only' by doing something like this:

    {
        "command: "click",
        "data": "input[type=button].next"
    },
    {
        "command": "selectAll",
        "data": "div.results"
    },
    {
        "command": "getAttributeValues",
        "data": {
            "fromStep": 3,
            "attributeName": "innerText"
        }
    },
    {
        "command": "repeat",
        "data": {
            "steps": [1, 2, 3],
            "times": 10
        }
    },
    {
        "command": "save",
        "data": {
            "fromStep": 4,
            "fileName": "grouped-response"
        }
    }

Repeats the click, selectAll and getAttributeValues commands ten times, then saves all their data.

---

#### runScript
**data**: `string`

Run a piece of JavaScript code on the page.

Example:

    {
        "command": "runScript",
        "data": "document.querySelector('button.btn1').click();"
    }

Clicks a button with class `.btn1` on the current page.

---

#### save
**data**: { `fileName`, `fromStep` }

Save JSON encoded data to the file `fileName` from the step defined by `fromStep`. If `fileName` is not provided, a filename will be automatically generated.

Example:

    {
        "command": "save",
        "data: {
            "fromStep": 1,
            "fileName": "test.json"
        }
    }
    
Saves results from step 1 to a file named test.json.

---

#### screenshot
**data**: { `fileName` }

Saves a screenshot of the currently loaded webpage to the file `fileName`. If `fileName` is not provided, a filename will be automatically generated.

Example:

    {
        "command": "screenshot"
    }
    
Saves a screenshot with an automatically generated filename returned upon command completion.

---

#### scrollPageToEnd
**data**: { [`timeout = 60`, [`maxScrolls = null`, [`maxRetries = 5`]]] }

Scrolls to the end of the currently loaded webpage. It will allow you to scroll down on infinite loading webpages. You can specify various timeouts and limits: `timeout` defaults to 60 seconds. This is a hard limit for the entire operation, and if exceeded will return the current scroll position. `maxScrolls` is the number of total scrolls it will try, the default is `null` which means there is no limit. `maxRetries` defaults to 5, it is compared when the new scroll position after processing a scroll matches the old scroll position - it generally means that you have reached the end of an infinitely-scrolling page, but could possibly be a network timeout.

Example:

    {
        "command": "scrollPageToEnd",
        "data": { 
            "timeout": 180,
            "maxRetries": null
        }
    }
    
Will try to scroll infinitely for three minutes without exception.

---

#### search
**data**: `Search text`

Finds an element on the page called `input[type=text][name=q]`, types your search query in to it, then presses the return key to complete the search. Should work on most search engines.

---

#### select
**data**: `CSS Selector string`

Select an element defined by the CSS selector string and return its data.

---

#### selectAll
**data**: `CSS Selector string`

Select multiple elements defined by the CSS selector string and return all of their data.

---

#### sendKeys
**data**: { `selector`, `string` }

Send the text `string` to the element defined by CSS selector `selector`.

Example:

    {
        "command": "sendKeys",
        "data": {
            "selector": "input[type=text]#name",
            "string": "My Name"
        }
    }

---

#### wait

Waits a number of milliseconds as defined in the data. The default milliseconds to wait is 1000 (1 second).

Example:

    {
        "command": "wait",
        "data": "5000"
    }

Waits 5 seconds before completing the command.

---

#### waitForPageToLoad

Waits for the current page to load. This is determined by the `document.readyState` which will return `complete` when the page is loaded.

Example:

    {
        "command": "waitForPageToLoad"
    }

Will simply wait for the page to load.

---

### Common Command Variables

#### fromStep

Used when grabbing results from a previous step. fromStep is an int that corresponds to the step number of the command results you wish to access.

#### matchingExpression

A string containing a regular expression that is used to test a set of results.

#### matchingExpressionFlags

Flags like "i", "im", "g", etc. to use with your regular expression in matchingExpression

#### usingExpression

A jexpr expression that returns a single level array of values from a mixed object/array. 

Consider the following object:

    {
        "Name": "Aaron Cunnington",
        "Address": {
            "Street": "123 Super Road",
            "City": "Metaville",
            "Country": "Landtopia"
        },
        "Cool_Numbers": [
            123,
            1337,
            42
        ]
    }

Assuming this is the result data from step number 1, I could grab the Street by using the following expression: `["Address", "Street"]`. I could also access it with: `["/^A/", "/^S/"]`.

I could get all numbers like this: `["Cool_Numbers", "*"]` and like this: `["/rs$/", "*"]` but also by specifying a 'range' using regular expressions like this: `["/l_n/i", "/[0-9]+/"]`

Consider the following array:

    [
        { "Test": "Something" },
        { "Test": "Something else" },
        { "Test": "Some cool stuff" },
        { "Things": "There are things here" }
    ]

I can grab the values of everything with this: `["*", "/^T/"]`, or just the first two objects like this: `["/[0-1]/"]` or their values like this: `["/[0-1]/", "*"]`.

You can grab items when only their value matches an expression like this: `["*", "*", "/something/i"]` - this would return "Something", and "Something else".