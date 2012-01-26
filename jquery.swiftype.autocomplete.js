(function ($) {
  var ident = 0;

  $.fn.swiftype = function (options) {
    var options = $.extend({}, $.fn.swiftype.defaults, options);

    return this.each(function () {
      var $this = $(this);
      var config = $.meta ? $.extend({}, options, $this.data()) : options;
      $this.attr('autocomplete', 'off');
      $this.data('swiftype-config', config);
      $this.submitted = false;
      $this.cache = new LRUCache(10);
      $this.emptyQueries = [];

      $this.isEmpty = function(query) {
				return $.inArray(normalize(query), this.emptyQueries) >= 0
      };

      $this.addEmpty = function(query) {
        $this.emptyQueries.unshift(normalize(query));
      };

      var $attachEl = config.attachTo ? $(config.attachTo) : $this;
      var offset = $attachEl.offset();
      var $list = $('<ul />').addClass(config.suggestionListClass).appendTo('body').hide().css({
        'position': 'absolute',
        'z-index': 999,
        'width': $attachEl.outerWidth() - 2,
        'top': offset.top + $attachEl.outerHeight() + 1,
        'left': offset.left
      });
      $this.data('swiftype-list', $list);

      $this.abortCurrent = function() {
        if ($this.currentRequest) {
          $this.currentRequest.abort();
        }
      };

      $this.hideList = function() {
        setTimeout(function() { $list.hide(); }, 10);
      };

      $this.focused = function() {
        return $this.is(':focus');
      };

      $this.submitting = function() {
        $this.submitted = true;
      };

      var typingDelayPointer;
      var suppressKey = false;
      $this.lastValue = '';
      $this.keyup(function (event) {
        if (suppressKey) {
          suppressKey = false;
          return;
        }

        // ignore arrow keys, shift
        if (((event.which > 36) && (event.which < 41)) || (event.which == 16)) return;

        if (config.typingDelay > 0) {
          clearTimeout(typingDelayPointer);
          typingDelayPointer = setTimeout(function () {
            processInput($this);
          }, config.typingDelay);
        } else {
          processInput($this);
        }
      });

      $this.keydown(function (event) {
        // enter = 13; up = 38; down = 40; esc = 27
        var $active = $list.children('li.' + config.activeItemClass);
        switch (event.which) {
        case 13:
          if (($active.length !== 0) && ($list.is(':visible'))) {
            event.preventDefault();
            var prefix = $this.val();
            config.onComplete($active.data('swiftype-dataItem'), prefix);
          } else if ($this.currentRequest) {
            $this.submitting();
          }
          $this.hideList();
          suppressKey = true;
          break;
        case 38:
          event.preventDefault();
          if ($active.length === 0) {
            $list.children('li:last-child').addClass(config.activeItemClass);
          } else {
            $active.prev().addClass(config.activeItemClass);
            $active.removeClass(config.activeItemClass);
          }
          break;
        case 40:
          event.preventDefault();
          if ($active.length === 0) {
            $list.children('li:first-child').addClass(config.activeItemClass);
          } else if ($active.is(':not(:last-child)')) {
            $active.next().addClass(config.activeItemClass);
            $active.removeClass(config.activeItemClass);
          }
          break;
        case 27:
          $this.hideList();
          suppressKey = true;
          break;
        default:
          $this.submitted = false;
          break;
        }
      });

      // opera wants keypress rather than keydown to prevent the form submit
      $this.keypress(function (event) {
        var $active = $list.children('li.' + config.activeItemClass);

        if ((event.which == 13) && ($list.children('li.' + config.activeItemClass).length > 0)) {
          event.preventDefault();
        }
      });

      // stupid hack to get around loss of focus on mousedown
      var mouseDown = false;
      var blurWait = false;
      $(document).bind('mousedown.swiftype' + ++ident, function () {
        mouseDown = true;
      });
      $(document).bind('mouseup.swiftype' + ident, function () {
        mouseDown = false;
        if (blurWait) {
          blurWait = false;
          $this.hideList();
        }
      });
      $this.blur(function () {
        if (mouseDown) {
          blurWait = true;
        } else {
          $this.hideList();
        }
      });
      $this.focus(function () {
        setTimeout(function() { $this.select() }, 10);
        if ($list.children(':not(.' + config.noResultsClass + ')').length > 0) {
          $list.show();
        }
      });
    });
  };

  var normalize = function(str) {
    return $.trim(str).toLowerCase();
  };

  var callRemote = function ($this, term) {
    $this.abortCurrent();
    var params = $.extend({}, {q: term, key: $this.data('swiftype-config').engineKey});
    $this.currentRequest = $.ajax({
      type: 'GET',
      dataType: 'jsonp',
      url: $this.data('swiftype-config').dataUrl,
      data: params
    }).success(function(data) {
      var norm = normalize(term);
      if (data.length > 0) {
        $this.cache.put(norm, data);
      } else {
        $this.addEmpty(norm);
        $this.data('swiftype-list').empty().hide();
        return;
      }
      processData($this, data, term);
    });
  };

  var getResults = function($this, term) {
    var norm = normalize(term);
    if ($this.isEmpty(norm)) {
      $this.data('swiftype-list').empty().hide();
      return;
    }
    var cached = $this.cache.get(norm);
    if (cached) {
      processData($this, cached, term);
    } else {
      callRemote($this, term);
    }
  };

  // private helpers
  var processInput = function ($this) {
      var term = $this.val();
      if (term === $this.lastValue) {
        return;
      }
      $this.lastValue = term;
      if ($.trim(term) === '') {
        $this.data('swiftype-list').empty().hide();
        return;
      }
      if (typeof $this.data('swiftype-config').dataUrl !== 'undefined') {
        getResults($this, term);
      }
    };

  var processData = function ($this, data, term) {
      var $list = $this.data('swiftype-list'),
        config = $this.data('swiftype-config');

      $list.empty().hide();
      data = data.slice(0, config.resultLimit);

      $.map(data, function(result) {
        $('<li>' + config.renderFunction(result, config) + '</li>').data('swiftype-dataItem', result).appendTo($list).click(function () {
          var $listItem = $(this);
          config.onComplete($listItem.data('swiftype-dataItem'));
        }).mouseover(function () {
          $(this).addClass(config.activeItemClass).siblings().removeClass(config.activeItemClass);
        });
      });

      if ((config.noResultsMessage !== undefined) && (data.length == 0)) $list.append($('<li class="' + config.noResultsClass + '">' + config.noResultsMessage + '</li>'));
      if ((data.length > 0 && $this.focused()) || (config.noResultsMessage !== undefined)) {
        if ($this.submitted) {
          $this.submitted = false;
        } else {
          $list.show();
        }
      }
    };

  var defaultRenderFunction = function(dataItem, config) {
    var out = '<p class="title">' + dataItem['title'] + '</p>';
    if (dataItem.sections) {
      var sections = '<span class="section">&lfloor; ' + dataItem.sections + '</span>';
      out = out.concat('<p class="sections">' + sections + '</p>')
    }
    return out;
  };
  var defaultOnComplete = function(dataItem, prefix) {
    window.location = dataItem['url'];
  };

  var defaultSortFunction = function (a, b, term) {
      return b['score'] - a['score'];
    };

	// simple client-side LRU Cache, based on https://github.com/rsms/js-lru

	function LRUCache(limit) {
	  this.size = 0;
	  this.limit = limit;
	  this._keymap = {};
	}

	LRUCache.prototype.put = function (key, value) {
	  var entry = {
	    key: key,
	    value: value
	  };
	  this._keymap[key] = entry;
	  if (this.tail) {
	    this.tail.newer = entry;
	    entry.older = this.tail;
	  } else {
	    this.head = entry;
	  }
	  this.tail = entry;
	  if (this.size === this.limit) {
	    return this.shift();
	  } else {
	    this.size++;
	  }
	};

	LRUCache.prototype.shift = function () {
	  var entry = this.head;
	  if (entry) {
	    if (this.head.newer) {
	      this.head = this.head.newer;
	      this.head.older = undefined;
	    } else {
	      this.head = undefined;
	    }
	    entry.newer = entry.older = undefined;
	    delete this._keymap[entry.key];
	  }
	  return entry;
	};

	LRUCache.prototype.get = function (key, returnEntry) {
	  var entry = this._keymap[key];
	  if (entry === undefined) return;
	  if (entry === this.tail) {
	    return entry.value;
	  }
	  if (entry.newer) {
	    if (entry === this.head) this.head = entry.newer;
	    entry.newer.older = entry.older;
	  }
	  if (entry.older) entry.older.newer = entry.newer;
	  entry.newer = undefined;
	  entry.older = this.tail;
	  if (this.tail) this.tail.newer = entry;
	  this.tail = entry;
	  return returnEntry ? entry : entry.value;
	};

	LRUCache.prototype.remove = function (key) {
	  var entry = this._keymap[key];
	  if (!entry) return;
	  delete this._keymap[entry.key];
	  if (entry.newer && entry.older) {
	    entry.older.newer = entry.newer;
	    entry.newer.older = entry.older;
	  } else if (entry.newer) {
	    entry.newer.older = undefined;
	    this.head = entry.newer;
	  } else if (entry.older) {
	    entry.older.newer = undefined;
	    this.tail = entry.older;
	  } else {
	    this.head = this.tail = undefined;
	  }

	  this.size--;
	  return entry.value;
	};

	LRUCache.prototype.clear = function () {
	  this.head = this.tail = undefined;
	  this.size = 0;
	  this._keymap = {};
	};

	if (typeof Object.keys === 'function') {
	  LRUCache.prototype.keys = function () {
	    return Object.keys(this._keymap);
	  };
	} else {
	  LRUCache.prototype.keys = function () {
	    var keys = [];
	    for (var k in this._keymap) keys.push(k);
	    return keys;
	  };
	}

  $.fn.swiftype.defaults = {
    activeItemClass: 'active',
    attachTo: undefined,
		dataUrl: 'http://localhost:3000/search/suggest.json',
    noResultsClass: 'noResults',
    noResultsMessage: undefined,
    onComplete: defaultOnComplete,
    renderFunction: defaultRenderFunction,
    resultLimit: 10,
    sortFunction: defaultSortFunction,
    suggestionListClass: 'st-autocomplete',
    typingDelay: 80,
  };
	
})(jQuery);