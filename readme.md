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
    
### Commands

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
**data**: null

Completes the campaign

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
**data**: { `fromStep`, `attributeName`, [`matchingExpression = null`, [`matchingExpressionFlags = ''`]] }

Returns attribute values from the step defined by `fromStep`. You can optionally specify a regular expression to match against using `matchingExpression`, and provide flags with `matchingExpressionFlags`.

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
**data**: { `tryLimit = 5` }

Scrolls to the end of the currently loaded webpage. It will allow you to scroll down on infinite loading webpages. There is currently no hard timeout. You can specify a try limit with `tryLimit` that will compare the new scroll position to the old scroll position that number of times before returning.

Example:

    {
        "command": "scrollPageToEnd",
        "data": { 
            "tryLimit": 3
        }
    }
    
Will try to scroll three times past the end of the page before returning results.

#### select
**data**: `CSS Selector string`

Select an element defined by the CSS selector string and return its data.

#### selectAll
**data**: `CSS Selector string`

Select multiple elements defined by the CSS selector string and return all of their data.

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

### Note regarding select and selectAll
`select` and `selectAll` commands return a JSON stringified version of the element in a stripped down form since DOM elements are not able to be stringified, so only non-object, non-function attributes will be returned, and nothing that is more than one level deep within an array.