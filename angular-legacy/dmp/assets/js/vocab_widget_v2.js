/*
  Copyright 2009 The Australian National University
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*******************************************************************************/
/**
 * Note: this plugin uses a derivative work from http://www.jstree.com/,
 * specifically the image sprite `../img/d.png`
 */
 ;(function($) {
    var WIDGET_NAME = "ANDS Vocabulary Widget service";
    var WIDGET_ID = "_vocab_widget_list";
    var WIDGET_DATA = "vocab_data";

    $.fn.vocab_widget = function(options, param) {

	param = typeof(param) === 'undefined' ? false : param;

	var defaults = {
	    //location (absolute URL) of the jsonp proxy
	    endpoint: 'https://vocabs.ardc.edu.au/api/v1.0/vocab.jsonp/',

	    //api_key set when instantiated
	    api_key: 'public',

	    //sisvoc repository to query.
	    repository: '',

	    //UI helper mode. currently, 'search', 'narrow', 'collection', and 'tree' are available
	    mode: "",

	    //search doesn't require any parameters, but narrow and collection do (and broaden will)
	    //in the latter case, the parameter is the URI to narrow/broaden on
	    mode_params: "",

	    //at most, how many results should be returned?
	    max_results: 100,

	    //search mode: how many characters are required before we send a query?
	    min_chars: 3,

	    //search mode: how long should we wait (after initial user input) before
	    //firing the search? provide in milliseconds
	    delay: 500,

	    //should we cache results? yes by default
	    cache: true,

	    //search mode: what to show when no hits? set to boolean(false) to suppress
	    nohits_msg: "No matches found",

	    //what to show when there's some weird error? set to boolean(false)
	    //to supress
	    error_msg: WIDGET_NAME + " error.",

	    //provide CSS 'class' references. Separate multiple classes by spaces
	    list_class: "vocab_list",

	    //which fields do you want to display? check the repository for
	    //available fields. nb:
	    //  - anzsrc-for uses [label, notation, about]
	    //  - rifcs uses [label, definition, about]
	    //
	    //nb: in browse mode, this should be a single element array
	    fields: ['label', 'notation', 'about'],

	    //what data field should be stored upon selection?
	    //in narrow mode, this is the option's value attribute
	    target_field: "label",

	    //solr count query fragment injector and operator
	    sqc: "",
	    sqc_op: "",

	    //display count or not
	    display_count: true
	};

	// Default changes if we're running within the ANDS environments
	if (typeof(window.real_base_url) !== 'undefined')
	{
		defaults['endpoint'] = window.real_base_url + 'api/vocab.jsonp/';
	}

	var settings;
	var handler;

	if (typeof(options) !== 'string') {
	    settings = $.extend({}, defaults, options);
	    //do some quick and nasty fixes
	    settings.list_class = typeof(settings.list_class) === 'undefined' ?
		"" :
		settings.list_class;

	    settings._wname = WIDGET_NAME;
	    settings._wid = WIDGET_ID;
	    try {
		return this.each(function() {
		    var $this = $(this);

		    switch(settings.mode) {
		    case 'search':
			handler = new SearchHandler($this, settings);
			break;
		    case 'narrow':
			handler = new NarrowHandler($this, settings);
			break;
		    case 'collection':
			handler = new CollectionHandler($this, settings);
			break;
		    case 'tree':
			handler = new TreeHandler($this, settings);
			break;
		    case 'advanced':
		    case 'core':
		    default:
			settings.mode = 'core';
			handler = new VocabHandler($this, settings);
			break;
		    }

		    if (typeof(handler) !== 'undefined') {
			$this.data('_handler', handler);
			handler.ready();
		    }
		    else {
			_alert('Handler not initialised');
		    }

		});
	    }
	    catch (err) {
		throw err;
		_alert(err);
	    }
	}
	else
	{
	    //We've been passed a string argument; only valid for advanced mode
	    return this.each(function() {
		var op = options;
		var $this = $(this);
		handler = $this.data('_handler');
		if (typeof(handler) === 'undefined' ||
		    handler._mode() !== 'core') {
			_alert('Plugin handler not found; ' +
				   'instantiate with no arguments before using, ' +
				   'or use a UI helper mode');
		}
		switch(op) {
		case 'search':
		    handler._search(param);
		    break;
		case 'narrow':
		    handler._narrow(param);
		    break;
		case 'top':
		    handler._top(param);
		    break;
		case 'collection':
			handler._collection(param);
			break;
		default:
		    if (typeof(defaults[op]) !== 'undefined')
		    {
			handler.settings[op] = param;
		    }
		    else
		    {
			_alert("invalid operation '" + op + "'");
		    }
		    break;
		}
	    });
	}

	function _alert(msg)
	{
	    alert(WIDGET_NAME + ': \r\n' + msg + '\r\n(reload the page before retrying)');
	}


	/**
	 * if we're here, an error has occurred; lose focus and unbind to avoid
	 * continuous errors
	 */
	try {
	    handler.detach();
	}
	catch (e) {}
	$(this).blur();
	return false;
    };

    /* Simple JavaScript Inheritance
     * By John Resig http://ejohn.org/
     * MIT Licensed.
     */
    // Inspired by base2 and Prototype
    (function() {
	var initializing = false;
	var fnTest = /xyz/.test(function(){xyz;}) ? /\b_super\b/ : /.*/;

	// The base Class implementation (does nothing)
	this.Class = function(){};

	// Create a new Class that inherits from this class
	Class.extend = function(prop) {
	    var _super = this.prototype;

	    // Instantiate a base class (but only create the instance,
	    // don't run the init constructor)
	    initializing = true;
	    var prototype = new this();
	    initializing = false;

	    // Copy the properties over onto the new prototype
	    for (var name in prop) {
		// Check if we're overwriting an existing function
		prototype[name] = typeof prop[name] == "function" &&
		    typeof _super[name] == "function" && fnTest.test(prop[name]) ?
		    (function(name, fn){
			return function() {
			    var tmp = this._super;

			    // Add a new ._super() method that is the same method
			    // but on the super-class
			    this._super = _super[name];

			    // The method only need to be bound temporarily, so we
			    // remove it when we're done executing
			    var ret = fn.apply(this, arguments);
			    this._super = tmp;

			    return ret;
			};
		    })(name, prop[name]) :
		exprop[name];
	    }

	    // The dummy class constructor
	    function Class() {
		// All construction is actually done in the init method
		if ( !initializing && this.init )
		    this.init.apply(this, arguments);
	    }

	    // Populate our constructed prototype object
	    Class.prototype = prototype;

	    // Enforce the constructor to be what we expect
	    Class.prototype.constructor = Class;

	    // And make this class extendable
	    Class.extend = arguments.callee;

	    return Class;
	};
    })();


    var VocabHandler = Class.extend({
	init: function(container, settings) {
	    this._container = container;
	    this.settings = settings;
	    this._ctype = this._container.get(0).tagName;
	},

	_mode: function() {
	    try
	    {
		return this.settings.mode;
	    }
	    catch (err)
	    {
		return false;
	    }
	},

	preconditions: function() {
	    return [];
	},

	/**
	 * Validates the handler for operation: reads in
	 * this.preconditions() and iterates over the rules to process
	 * @param the js object that holds the `fields` defined in
	 * this.preconditions(). If not provided, `this.settings` is used.
	 * @return bool, true or false depending on the outcome of
	 * validating preconditions.
	 */
	validate: function(settings) {
	    var options = typeof(settings) === 'undefined' ? this.settings : settings;

	    var is_valid = true;
	    var handler = this;
	    $.each(this.preconditions(), function(ridx, rule) {
		$.each(rule.fields, function(fidx, field) {
		    try {
			is_valid = is_valid && rule.test(options[field]);
		    }
		    catch (e) {
			is_valid = false;
		    }
		    if (!is_valid) {
			handler._throwing(field, rule.description, options);
			return false;
		    }
		});
		if (!is_valid) {
		    return false;
		}
	    });
	    return is_valid;
	},


	/**
	 * simplistic throwable template for input validation
	 */
	_throwing: function(val, rule, settings) {
	    throw "'" + val + "' must be " + rule + " (was: " + settings[val] + ")";
	},

	/**
	 * 'Facade' of sorts for this.do_ready(); this calls the validator,
	 * subsequently invoking `this.do_ready()` if validation passes.
	 * @return bool false is validation failed. might throw an exception as well.
	 */
	ready: function() {
	    if (this.validate()) {
		return this.do_ready();
	    }
	    else {
		return false;
	    }
	},

	/**
	 * Implemented by subclasses; prep widget
	 * for user interaction
	 */
	do_ready: function() {
	    return false;
	},

	/**
	 * Implemented by subclasses; disable
	 * widget's user interaction
	 */
	detach: function() {
	    return false;
	},

	/**
	 * basic error handler
	 */
	_err: function(xhr) {
	    if (typeof(this.settings['error_msg']) === 'boolean' &&
		this.settings['error_msg'] === false) {
	    }
	    else {
		var cid = this._container.attr('id');
		var footer;
		if (typeof(cid) === 'undefined') {
		    footer = "[Bound element has no id attribute; " +
			"If you add one, I'll report it here.]";
		}
		else {
		    footer = '(id: ' + cid + ')';
		}
		alert(this.settings['error_msg'] + "\r\n"
		      + xhr.responseText +
		      "\r\n" + footer);
	    }
	    this._container.blur();
	    return false;
	},

	__url: function(mode, lookfor) {
	  if (typeof(this.settings.repository) === 'undefined' ||
	      this.settings.repository === '') {
	    this._err({status: 500,
	               responseText:"No repository set"});

	    }
	    var url =  this.settings.endpoint +
        "?api_key=" + this.settings.api_key +
		"&action=" + mode +
		"&repository=" + this.settings.repository +
		"&limit=" + this.settings.max_results;
	    if (typeof(lookfor) !== 'undefined' &&
		lookfor !== false) {
		url = url + "&lookfor=" + lookfor;
	    }
	    if (typeof(this.settings.sqc) !== 'undefined' && this.settings.sqc !== '') {
			url = url + "&sqc=" + this.settings.sqc;
			if(typeof(this.settings.sqc_op) !== 'undefined' && this.settings.sqc_op!==''){
				url = url+'&sqc_op=' + this.settings.sqc_op;
			}
	    }
	    return url;
	},

	_search: function(opts) {
	    this.__act('search', opts);
	},

	_narrow: function(opts) {
	    this.__act('narrow', opts);
	},

	_collection: function(opts) {
	    this.__act('collection', opts);
	},

	_top: function(opts) {
	    this.__act('top', opts);
	},

	__act: function(action, opts) {
	    var handler = this;
	    var uri;
	    var callee;
	    var uaction = action;

	    if (typeof(opts) === 'undefined') {
		opts = false;
	    }

	    if (typeof(opts['uri']) !== 'undefined') {
		uri = opts['uri'];
	    }
	    else {
		uri = opts;
	    }

	    if (typeof(opts['callee']) !== 'undefined') {
		callee = opts['callee'];
	    }
	    else {
		callee = handler._container;
	    }

	    if (typeof(opts['all'] !== 'undefined') &&
	       opts['all'] === true) {
		uaction = "all" + action;
	    }


	    $.ajax({
		url: this.__url(uaction, uri),
		cache: this.settings.cache,
		dataType: "jsonp",
		success: function(data) { callee.trigger(action + '.vocab.ands', data); },
		error: function(xhr) { callee.trigger('error.vocab.ands', xhr); }
	    });
	}
    });

    var UIHandler = VocabHandler.extend({

	/**
	 * A set of rules that should be checked to ensure correct
	 * operation.
	 *
	 * This function should definitely be overridden by subclasses; the
	 * preconditions found here are generic. Call super() first,
	 * capture the result and ammend the array before returning.
	 *
	 * @return an array of validation callables and the associated data
	 * to validate, a js object with the following properties:
	 *   - fields: and array of configuration fields to check
	 *   - descripiton: a brief description of the test; used for error
	 *     output
	 *   - test: a closure that takes a single value (iterated over
	 *     fields) and returns bool true/false depending on validation
	 *     status
	 */
	preconditions: function() {
	    return [
		{
		    fields: ["min_chars", "max_results", "delay"],
		    description: "a positive integer",
		    test: function(val) {
			return (typeof(val) === 'number' &&
				val === ~~Number(val) &&
				val >= 0);
		    }
		},
		{
		    fields: ["cache"],
		    description: "a boolean",
		    test: function(val) { return typeof(val) === 'boolean'; }
		},
		{
		    fields: ["mode"],
	                // In fact, for advanced/core, "parent" VocabHandler
	                // is used, so we don't handle those cases here.
		    description: "one of <search,narrow,collection,tree,advanced,core>",
		    test: function(val) {
			return (val === 'search' ||
				val === 'narrow' ||
				val === 'collection' ||
				val === 'tree' ||
				val === 'advanced' ||
				val === 'core');
		    }
		},
		{
		    fields: ["endpoint"],
		    description: "a URL",
		    test: function(val) {
			return new RegExp("^(http|https)\://.*$").test(val);
		    }
		},
		{
		    fields: ["list_class", "repository"],
		    description: "a string",
		    test: function(val) {
			return (typeof(val) === 'undefined' ||
				typeof(val) === 'string');
		    }
		}
	    ];
	},

	_makelist: function(persist) {
	    if (typeof(persist) === 'undefined') {
		persist = false;
	    }
	    this._list = $('<ul />')
		.attr('id', this._container.attr('id') + this.settings._wid)
		.addClass(this.settings.list_class)
		.addClass(this.settings.repository)
		.addClass(this.mode)
		.data('persist', persist)
		.hide();
	    this._list.insertAfter(this._container);
	    this._container.attr('autocomplete', 'off');
	},n
