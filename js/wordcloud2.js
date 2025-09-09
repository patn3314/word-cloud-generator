/*!
 * wordcloud2.js
 * http://timdream.org/wordcloud2.js/
 *
 * Copyright 2011 - 2013 Tim Chien
 * Released under the MIT license.
 */

'use strict';

// setImmediate function that works in browsers
if (!window.setImmediate) {
  window.setImmediate = (function setupSetImmediate() {
    return window.msSetImmediate ||
    window.webkitSetImmediate ||
    window.mozSetImmediate ||
    window.oSetImmediate ||
    (function setupSetZeroTimeout() {
      if (!window.postMessage || !window.addEventListener) {
        return null;
      }

      var callbacks = [undefined];
      var message = 'zero-timeout-message';

      // Like setTimeout, but only takes a function argument.  There's
      // no time argument (always zero) and no arguments (you have to
      // use a closure).
      var setZeroTimeout = function setZeroTimeout(callback) {
        var id = callbacks.length;
        callbacks.push(callback);
        window.postMessage(message + id.toString(36), '*');

        return id;
      };

      window.addEventListener('message', function setZeroTimeoutMessage(evt) {
        // Skipping checking event source, origin and data, for simplicity
        if (typeof evt.data !== 'string' ||
            evt.data.substr(0, message.length) !== message/* ||
            evt.source !== window */) {
          return;
        }

        evt.stopImmediatePropagation();

        var id = parseInt(evt.data.substr(message.length), 36);
        if (!callbacks[id]) {
          return;
        }

        callbacks[id]();
        callbacks[id] = undefined;
      }, true);

      /* specify clearImmediate() here since we need the scope */
      window.clearImmediate = function clearZeroTimeout(id) {
        if (!callbacks[id]) {
          return;
        }

        callbacks[id] = undefined;
      };

      return setZeroTimeout;
    })() ||
    // fallback
    function setImmediate(callback) {
      window.setTimeout(callback, 0);
    };
  })();
}

if (!window.clearImmediate) {
  window.clearImmediate = (function setupClearImmediate() {
    return window.msClearImmediate ||
    window.webkitClearImmediate ||
    window.mozClearImmediate ||
    window.oClearImmediate ||
    // fallback
    function clearImmediate(id) {
      window.clearTimeout(id);
    };
  })();
}

(function(global) {

  // Check if WordCloud can run on this browser
  var isSupported = (function isSupported() {
    var canvas = document.createElement('canvas');
    if (!canvas || !canvas.getContext) {
      return false;
    }

    var ctx = canvas.getContext('2d');
    if (!ctx) {
      return false;
    }
    if (!ctx.getImageData) {
      return false;
    }
    if (!ctx.fillText) {
      return false;
    }

    if (!Array.prototype.some) {
      return false;
    }
    if (!Array.prototype.push) {
      return false;
    }

    return true;
  }());

  // Find out if the browser impose a limit on canvas size
  var maxCanvasSize = (function maxCanvasSize() {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var width = 2048;
    var height = 2048;

    /* Read more about this on
     * http://www.williammalone.com/articles/html5-canvas-javascript-better-performance/
     */
    width = Math.floor(width);
    height = Math.floor(height);

    canvas.width = width;
    canvas.height = height;

    try {
      // Some browser using black background by default.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      // We are not interested in the content of the image,
      // but just the fact that we can read the data URL.
      // If we can't, the canvas is too big.
      canvas.toDataURL();
    } catch (e) {
      // The canvas is too big.
      width = 0;
      height = 0;
    }

    // Occasionally a browser may return a blank image instead of throwing
    // an exception when the canvas is too big.
    // Try to detect that here.
    if (width !== 0) {
      var data = ctx.getImageData(0, 0, width, height).data;
      if (data.length === 0) {
        width = 0;
        height = 0;
      }
    }

    // If the browser threw an exception, width and height will be 0.
    // If the browser returned a blank image, width and height will be 0.
    // If the browser worked, width and height will be their original values.
    // But we don't know if the browser can support bigger canvases.
    // So we'll have to keep trying until we find a size that is too big.
    // This may be slow, so we'll just use a fixed value for now.
    // TODO: A better way to do this.
    return 2048;
  })();

  // The library
  var WordCloud = function WordCloud(elements, options) {
    if (!isSupported) {
      return;
    }

    if (!Array.isArray(elements)) {
      elements = [elements];
    }

    elements.forEach(function(el, i) {
      if (typeof el === 'string') {
        elements[i] = document.getElementById(el);
        if (!elements[i]) {
          throw 'The element id specified is not found.';
        }
      } else if (!el.tagName && !el.appendChild) {
        throw 'You must pass valid HTML elements, or ID of the element.';
      }
    });

    /* Default values to be overridden by options object */
    var settings = {
      list: [],
      fontFamily: '"Trebuchet MS", "Heiti TC", "微軟正黑體", ' +
                  '"Arial Unicode MS", "Droid Fallback Sans", sans-serif',
      fontWeight: 'normal',
      color: 'random-dark',
      minSize: 0, // 0 to disable
      weightFactor: 1,
      clearCanvas: true,
      backgroundColor: '#fff',  // opaque white = #fff

      // If the word should rotate, the minimum rotation angle in degree
      // placed randomly.
      minRotation: -Math.PI / 2,
      maxRotation: Math.PI / 2,

      // If the word should rotate, the number of rotation step.
      // The more steps, the more likely the word will be able to fit.
      rotationSteps: 2,

      // Shuffle the points to draw so the result will be different each time
      // for the same list and settings.
      shuffle: true,

      // The shape of the cloud.
      // Can be any word that is recognize by CSS typing, defined by circular function.
      shape: 'circle',

      // The radius of the grid cells.
      gridSize: 8,

      // If the word has the same dimension, we can skip the measure step
      // and use the result of the last measure.
      // This is particularly useful for printing purpose.
      // It is not recommended to turn this on on screen since all words
      // will have the same dimension.
      drawOutOfBound: false,

      // If there is not enough space, will the wordcloudcard draw part of the word
      // to make it fit?
      shrinkToFit: false,

      // A callback function to be called when the word is about to be drawn.
      // It will receive two arguments: the word and the dimension of the word.
      // The callback can return a settings object to override the settings
      // for this particular word.
      // The callback can also return false to skip the word.
      wordRender: null,

      // A callback function to be called when the word is successfully placed.
      // It will receive two arguments: the word and the dimension of the word.
      wordPlaced: null,

      // A callback function to be called when the word is not successfully placed.
      // It will receive two arguments: the word and the dimension of the word.
      wordNotPlaced: null,

      // A callback function to be called when the wordcloud is stopped.
      // It will receive two arguments: the number of words drawn and the total number of words.
      stopped: null,

      // A callback function to be called when the wordcloud is finished.
      // It will receive two arguments: the number of words drawn and the total number of words.
      finished: null,

      // A callback function to be called when the wordcloud is about to start.
      // It will receive the number of words.
      starting: null,

      // A callback function to be called when the wordcloud is abort.
      // It will receive the number of words.
      abort: null,

      // The number of milliseconds to wait between each attempt to draw a word.
      wait: 0,

      // The number of milliseconds to wait before the next attempt to draw a word.
      // This is used when the previous attempt to draw a word failed.
      // This is to prevent the browser from freezing.
      retry: 0,

      // The number of milliseconds to wait before the wordcloudcard should abort.
      // 0 to disable.
      abortThreshold: 0,

      // If the browser is not responding for a long time, the wordcloudcard will
      // abort.
      // The number of milliseconds to wait before the wordcloudcard should abort.
      // 0 to disable.
      abortTimeout: 0,

      // The number of milliseconds to wait before the wordcloudcard should
      // resize the canvas.
      // 0 to disable.
      resize: 0,

      // The number of words to be drawn in each transaction.
      // 0 to disable.
      wordCount: 0,

      // The number of words to be drawn in each transaction.
      // 0 to disable.
      wordCountThreshold: 0,
    };

    if (options) {
      for (var key in options) {
        if (key in settings) {
          settings[key] = options[key];
        }
      }
    }

    /* Wait for the DOM to be ready */
    if (document.readyState !== 'complete') {
      // The DOM is not ready yet, schedule the wordcloud to be drawn later.
      var that = this;
      window.addEventListener('load', function() {
        that.start();
      }, false);
      return;
    }

    /* Make sure the list is sorted by word length (longest first) */
    // In case of the same word length, the larger word count should be first.
    settings.list.sort(function(a, b) {
      if (a[1] === b[1]) {
        return a[0].length - b[0].length;
      }
      return b[1] - a[1];
    });

    /* Get the max and min of the word count */
    var max = -Infinity;
    var min = Infinity;
    settings.list.forEach(function(item) {
      if (item[1] > max) {
        max = item[1];
      }
      if (item[1] < min) {
        min = item[1];
      }
    });

    /* Calculate the font size of each word */
    settings.list.forEach(function(item) {
      var size = settings.weightFactor(item[1]);
      if (size > settings.minSize) {
        item.push(size);
      }
    });

    /* Start the drawing of the word cloud */
    this.start = function() {
      // For each word, calculate the size of the word and the position
      // and draw the word on the canvas.
      var that = this;
      var i = 0;
      var total = settings.list.length;
      var drawn = 0;
      var abort = false;
      var abortTimeout = null;
      var abortThreshold = null;
      var timer = null;

      if (settings.starting) {
        settings.starting(total);
      }

      function draw() {
        if (abort) {
          if (settings.abort) {
            settings.abort(drawn, total);
          }
          if (settings.stopped) {
            settings.stopped(drawn, total);
          }
          return;
        }

        if (i >= total) {
          if (settings.finished) {
            settings.finished(drawn, total);
          }
          if (settings.stopped) {
            settings.stopped(drawn, total);
          }
          return;
        }

        var item = settings.list[i];
        var word = item[0];
        var weight = item[1];
        var size = item[2];

        var wordRender = settings.wordRender;
        if (wordRender) {
          var newSettings = wordRender(word, weight, size, i, total);
          if (newSettings === false) {
            i++;
            setImmediate(draw);
            return;
          }
          if (newSettings) {
            for (var key in newSettings) {
              if (key in settings) {
                settings[key] = newSettings[key];
              }
            }
          }
        }

        var that = this;
        var t = new Date().getTime();

        function place(ctx, word, size) {
          var R = Math.floor(
            Math.sqrt(ctx.canvas.width * ctx.canvas.width +
                      ctx.canvas.height * ctx.canvas.height) / 2
          );
          var points = that.getPoints(R, settings.shape);
          if (settings.shuffle) {
            points.sort(function() {
              return 0.5 - Math.random();
            });
          }

          var drawn = false;

          for (var j = 0; j < points.length; j++) {
            var g = that.getGrid(ctx, word, size, points[j][0], points[j][1]);
            if (that.canFit(ctx, word, size, g.gx, g.gy, g.gw, g.gh, points[j][2])) {
              that.drawWord(ctx, word, size,
                            g.gx, g.gy, points[j][2],
                            settings.color(word, weight, size,
                                          distance(points[j][0], points[j][1]),
                                          points[j][2]));
              drawn = true;
              break;
            }
          }

          return drawn;
        }

        function distance(x, y) {
          return Math.sqrt(x * x + y * y);
        }

        elements.forEach(function(el) {
          var ctx = el.getContext('2d');
          if (settings.clearCanvas) {
            ctx.fillStyle = settings.backgroundColor;
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            if (settings.backgroundColor !== 'transparent') {
              ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            }
          }

          ctx.font = settings.fontWeight + ' ' +
                     (size).toString(10) + 'px ' +
                     settings.fontFamily;
          ctx.textBaseline = 'middle';

          var placed = place(ctx, word, size);

          if (placed) {
            drawn++;
            if (settings.wordPlaced) {
              settings.wordPlaced(item, drawn, total);
            }
          } else {
            if (settings.wordNotPlaced) {
              settings.wordNotPlaced(item, drawn, total);
            }
          }

          i++;
        });

        if (settings.wait > 0) {
          timer = setTimeout(draw, settings.wait);
        } else {
          setImmediate(draw);
        }
      }

      this.stop = function() {
        abort = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (abortTimeout) {
          clearTimeout(abortTimeout);
          abortTimeout = null;
        }
        if (abortThreshold) {
          clearTimeout(abortThreshold);
          abortThreshold = null;
        }
      };

      if (settings.abortTimeout > 0) {
        abortTimeout = setTimeout(this.stop, settings.abortTimeout);
      }

      if (settings.abortThreshold > 0) {
        var last = new Date().getTime();
        abortThreshold = setInterval(function() {
          var now = new Date().getTime();
          if (now - last > settings.abortThreshold) {
            that.stop();
          }
          last = now;
        }, settings.abortThreshold);
      }

      if (settings.resize > 0) {
        window.addEventListener('resize', this.stop, false);
      }

      setImmediate(draw);
    };

    /* Get the grid of the word */
    this.getGrid = function(ctx, word, size, x, y) {
      var gw = Math.ceil(ctx.measureText(word).width);
      var gh = Math.ceil(size);
      var gx = x - gw / 2;
      var gy = y - gh / 2;
      return {
        gx: gx,
        gy: gy,
        gw: gw,
        gh: gh
      };
    };

    /* Get the points to draw the words */
    this.getPoints = function(R, shape) {
      var points = [];
      var i = 0;
      var that = this;

      function push(x, y, r) {
        points.push([
          Math.floor(x * R + that.center.x),
          Math.floor(y * R + that.center.y),
          r
        ]);
      }

      if (typeof shape === 'function') {
        for (i = 0; i < 360; i++) {
          var r = shape(i);
          push(r * Math.cos(i / 180 * Math.PI),
               r * Math.sin(i / 180 * Math.PI),
               0);
        }
      } else {
        switch (shape) {
          case 'circle':
            for (i = 0; i < 360; i += 4) {
              push(Math.cos(i / 180 * Math.PI),
                   Math.sin(i / 180 * Math.PI),
                   0);
            }
            break;
          case 'cardioid':
            for (i = 0; i < 360; i++) {
              var r = 1 - Math.sin(i / 180 * Math.PI);
              push(r * Math.cos(i / 180 * Math.PI),
                   r * Math.sin(i / 180 * Math.PI),
                   0);
            }
            break;
          case 'diamond':
          case 'square':
            var r = 1 / (Math.abs(Math.cos(i / 180 * Math.PI)) + Math.abs(Math.sin(i / 180 * Math.PI)));
            for (i = 0; i < 360; i++) {
              push(r * Math.cos(i / 180 * Math.PI),
                   r * Math.sin(i / 180 * Math.PI),
                   0);
            }
            break;
          case 'triangle-forward':
            var r = 1 / (Math.cos(i / 180 * Math.PI) + Math.sqrt(3) * Math.sin(i / 180 * Math.PI));
            for (i = 0; i < 360; i++) {
              push(r * Math.cos(i / 180 * Math.PI),
                   r * Math.sin(i / 180 * Math.PI),
                   0);
            }
            break;
          case 'triangle':
          case 'pentagon':
            var r = 1 / (Math.cos(i / 180 * Math.PI) + Math.sin(i / 180 * Math.PI));
            for (i = 0; i < 360; i++) {
              push(r * Math.cos(i / 180 * Math.PI),
                   r * Math.sin(i / 180 * Math.PI),
                   0);
            }
            break;
          case 'star':
            var r = 1 / (Math.cos(i / 180 * Math.PI) + 2 * Math.sin(i / 180 * Math.PI));
            for (i = 0; i < 360; i++) {
              push(r * Math.cos(i / 180 * Math.PI),
                   r * Math.sin(i / 180 * Math.PI),
                   0);
            }
            break;
        }
      }

      return points;
    };

    /* Check if the word can fit in the canvas */
    this.canFit = function(ctx, word, size, gx, gy, gw, gh, angle) {
      if (gx < 0 || gy < 0 ||
          gx + gw > ctx.canvas.width ||
          gy + gh > ctx.canvas.height) {
        if (!settings.drawOutOfBound) {
          return false;
        }
      }

      var imageData = ctx.getImageData(gx, gy, gw, gh).data;

      for (var i = 0; i < imageData.length; i += 4) {
        if (imageData[i + 3] > 0) {
          return false;
        }
      }

      return true;
    };

    /* Draw the word on the canvas */
    this.drawWord = function(ctx, word, size, gx, gy, angle, color) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.translate(gx + ctx.measureText(word).width / 2, gy + size / 2);
      if (angle !== 0) {
        ctx.rotate(angle);
      }
      ctx.fillText(word, -ctx.measureText(word).width / 2, 0);
      ctx.restore();
    };

    /* Expose some of the properties and methods */
    this.settings = settings;
    this.center = {
      x: elements[0].width / 2,
      y: elements[0].height / 2
    };

    /* Pre-calculate the points */
    if (settings.shape !== 'random') {
      var R = Math.floor(
        Math.sqrt(elements[0].width * elements[0].width +
                  elements[0].height * elements[0].height) / 2
      );
      this.points = this.getPoints(R, settings.shape);
    }
  };

  WordCloud.isSupported = isSupported;
  WordCloud.maxCanvasSize = maxCanvasSize;

  // AMD / CommonJS module support
  if (typeof define === 'function' && define.amd) {
    define('wordcloud', [], function() {
      return WordCloud;
    });
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = WordCloud;
  } else {
    global.WordCloud = WordCloud;
  }

})(this);