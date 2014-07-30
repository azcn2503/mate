# Mate Server

## Prerequisites

* Selenium Server
* Node
    * Requires NPM packages: mongodb, events, fs, selenium-webdriver
    
## Usage

Check out the following `soundcloud.json` file:

    [
        {
            "command": "open",
            "data": "http://www.soundcloud.com/anjunadeep/following"
        },
        {
            "command": "scrollPageToEnd"
        },
        {
            "command": "selectAll",
            "data": "a.userAvatarBadge__usernameLink"
        },
        {
            "command": "getAttributeValues",
            "data": {
                "fromStep": 2,
                "attributeName": "href",
                "matchingExpression": "an"
            }
        },
        {
            "command": "matchEach",
            "data": {
                "fromStep": 3,
                "matchingExpression": "[^/]*$",
                "mode": "match"
            }
        },
        {
            "command": "save"
        }
    ]

You can process it by running:

    node main.js soundcloud

You will see the commands, data and results output to the console.

Then you can open `soundcloud.json` to view the full results!
    
### Campaign Files

Campaign files like the one above are simply JSON files with various steps (commands and accompanying data) instructing the mate application what to do. 

Every step must have a `command` string, and optionally a mixed `data` object, like this:

    {
        "command": "open",
        "data": "www.google.com"
    }

Some commands require that `data` be an object with mixed content, like the `getAttributeValues` command.

When a campaign file is saved it will save additional information against each step, like so:

    {
        "command": "open",
        "data": "www.google.com",
        "performance": {
            "start": 123456789,
            "end": 123456789
        },
        "result": {
            "success": true
        },
        "waiting": false,
        "processed": true,
        "step": 0
    }

`performance.start` is the time in microseconds when the command started, and `performance.end` is the time in microseconds when the command finished.

`result` contains the output from the command, it can be various things, but usually will contains `success` denoting whether the command failed or succeeded.

`waiting` and `processed` manage the state of the command. You can re-run a command by changing `processed` to false. `waiting` is true when the command is started, and false when the command completes. `processed` is false always except when the command is completed.

`step` tells you the step number of the command. Each step is executed sequentially.

#### Saving

You can save your campaign simply by passing the `done` command with an optional filename. If a filename is not specified then the original campaign file will be overwritten. You probably don't want to overwrite your campaign file if you are using variables!

For our above example we might do this:

    {
        "command": "done",
        "data": "soundcloud-output"
    }

And it will save as `soundcloud-output.json`.

#### Variables

You can specify variables in your campaign template like so:

    {
        "command": "open",
        "data": "http://www.mywebpage.com/user/{{args.username}}"
    }

All variables should be prefixed with `args.` as demonstrated above.

Be sure to start the application like this:

    node main.js campaignfile --username=businessguy
    
### Commands

#### assert
**data**: {`fromStep`, `fromIndex`, `operator`, `expected`}

Assert that the data from step `fromStep[fromIndex]` matches the `expected` value compared by the `operator`. If `fromIndex` is not specified, it will assume that either you are asserting a non-array or non-object data set and assert a string, number, boolean etc., or, if the data set is an array or an object then it will iterate the entire array until it finds a match, and will return the index it matched at. You can force this setting by providing `*` as the `fromIndex` value. `fromIndex` can also be an array of keys so that you can assert many levels within a data set.

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

#### done
**data**: `fileName string`

Completes the campaign and ends the node process. You can optionally specify the filename that the campaign file will be saved as. If a filename is not specified, it will overwrite the original campaign file. The file extension `.json` will automatically be added if it is not present.

---

#### evalEach
**data**: { `fromStep`, `eval` }

Evaluates JavaScript against a set of results returned by `getAttributeValues`. The result data takes the context of `this` when evaluated.

Example:

    {
        "command": "evalEach",
        "data": {
            "fromStep": 1,
            "eval": "return this.match(/[^/]*$/)[0]"
        }
    }
    
This will return only those attribute values that match the expression `[^/]*$`

---

#### getAttributeValues
**data**: { `fromStep int`, `attributeName mixed`, [`matchingExpression mixed`, [`matchingExpressionFlags mixed`]] }

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

This will retrurn all the innerHTML and innerText values.

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

---

#### matchEach
**data**: { `fromStep`, `matchingExpression`, [`matchingExpressionFlags = ''`, [`mode = 'match'`]] }

Returns data when the expression defined by `matchingExpression` is satisfied. You can optionally specify regular expression flags with `matchingExpressionFlags`.

The mode takes three values: `"full"` returns the full data when there is a match, `"array"` returns an array containing the matches and segments, and `"match"` (Default) returns only the matching text.

Example:

    {
        "command": "matchEach",
        "data": {
            "fromStep": 1,
            "matchingExpression": "an",
            "matchingExpressionFlags": "i",
            "mode": "full"
        }
    }
    
Returns the full value of data when the expression of `/an/i` is met.

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
**data**: `number`

Repeats the command defined by the step index number.

Example:

    {
        "command": "repeat",
        "data": 2
    }
    
Repeats command 2.

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

### suggestSelector
**data**: `data string`

Used to query what is on the remotely loaded page. Useful for finding out what is on the page when you are not sure of what selector to use. It will convert your query in to the most loose form possible. It can be used to search for partial tag names, partial class names and partial ids. It should return an array of valid selectors.

Example:

    {
        "command": "suggestSelector",
        "data": "b>d s.c"
    }

Expected response might be: `body>div span.cool-class`