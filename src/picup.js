$(function() {
	'use strict';

	var toURL = window.URL.createObjectURL;

	var b64toBlob = function(b64Data, contentType) {
		contentType = contentType || 'image/png';
		var sliceSize = 512;

		var byteCharacters = atob(b64Data.split(/,/)[1]);
		var byteArrays = [];

		for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
			var slice = byteCharacters.slice(offset, offset + sliceSize),
				byteNumbers = new Array(slice.length);

			for (var i = 0; i < slice.length; i++) {
				byteNumbers[i] = slice.charCodeAt(i);
			}
			byteArrays.push(new Uint8Array(byteNumbers));
		}
		var blob = new Blob(byteArrays, {type: contentType});
		return blob;
	};

	var PicUpInstance = function(el) {
		this.input = el.find('input[type="file"]').change(this.handleInput.bind(this));
		this.el = el.find('.pic-up').css('position', 'relative').html(this.html);

		this.window = el.find('.pic-up-window');
		this.cropping = el.find('.pic-up-crop');
		this.full = el.find('.pic-up-full');
		this.throbber = el.find('.throbber').hide();
		this.zoomInBtn = el.find('.pic-up-zoom-in');
		this.zoomOutBtn = el.find('.pic-up-zoom-out');
		this.rotateLeftBtn = el.find('.pic-up-rotate-left');
		this.rotateRightBtn = el.find('.pic-up-rotate-right');
		this.exportBtn = el.find('.pic-up-export');

		el.find('.pic-up-controls').css({
			position: 'relative',
			zIndex: 2
		});

		this.bindDrag();
		this.bindMobile();
		this.bindRotate();
		this.bindZoom();
		this.bindExport();
	};
	PicUpInstance.prototype = {
		bindDrag: function() {
			var self = this;

			// Handle dragging with a mouse
			self.cropping.mousedown(function(event) {
				if (event.which !== 1) return;

				event.preventDefault();
				var mouseX = event.pageX - $(this).offset().left,
					mouseY = event.pageY - $(this).offset().top;

				$(window).mousemove(function(event2) {
					var coords = [
						event2.pageX - mouseX - self.elLeft,
						event2.pageY - mouseY - self.elTop
					];
					self.verifyCoords(coords);
				});
			});

			$(document).mouseup(function() {
				$(window).off('mousemove');
			});
		},

		bindExport: function() {
			this.exportBtn.click(this.exportImg.bind(this));
		},

		bindMobile: function() {
			var self = this,
				dragging = true; // 1 touch == drag, 2 touches == pinchZoom

			self.cropping.on('touchstart', function(event) {
				var touches = event.originalEvent.touches;
				if (touches.length === 2) dragging = false;

				event.preventDefault();
				var touchX = touches[0].pageX - this.x,
					touchY = touches[0].pageY - this.y;

				$(window).off('touchmove touchend').on('touchmove', function(event2) {
					var touches2 = event2.originalEvent.touches;
					if (dragging) {
						var coords = [
							touches2[0].pageX - touchX - self.elLeft,
							touches2[0].pageY - touchY - self.elTop
						];
						self.verifyCoords(coords);
						return;
					}

					// Zoom
					var originalScale = self.scale;
					self.scale = Math.min(400, Math.max(5, self.scale * Math.hypot(touches2[0].pageX - touches2[1].pageX, touches2[0].pageY - touches2[1].pageY) /
					               Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY)));
					if (self.scale === originalScale) return;

					self.setSize(self.height * (self.scale / 100), self.width * (self.scale / 100));
					touches = touches2;

				}).on('touchend', function(event2) {
					$(this).off('touchmove touchend');
					dragging = true;
				});
			});

			// iOS
			self.cropping.on('gesturestart', function(event) {
				event.preventDefault();
				var originalScale = self.scale;

				$(window).off('gesturechange gestureend').on('gesturechange', function(event2) {
					event2.preventDefault();

					self.scale = Math.min(400, Math.max(5, originalScale * event2.originalEvent.scale));
					self.setSize(self.height * (self.scale / 100), self.width * (self.scale / 100));

				}).on('gestureend', function(event2) {
					$(this).off('gesturechange gestureend');
				});
			});
		},

		bindRotate: function() {
			var self = this;
			self.rotateLeftBtn.add(self.rotateRightBtn).click(function() {
				self.rotate($(this).is(self.rotateRightBtn));
			});
			// Right clicking the cropping rotates image to the right
			self.window.on('contextmenu', function(event) {
				event.preventDefault();
				self.rotate(true);
			});
		},

		bindZoom: function() {
			var self = this;

			// Zoom with the mousewheel
			self.window.on('mouse mousewheel DOMMouseScroll', function(event) {
				event.preventDefault();
				if (event.originalEvent.wheelDelta > 0 || event.originalEvent.detail < 0) {
					for (var i = 0; i < 10; i++) {
						self.zoom(true);
					}
				} else {
					for (var i = 0; i < 10; i++) {
						self.zoom(false);
					}
				}
			});

			// Zoom with in/out buttons
			self.zoomInBtn.add(self.zoomOutBtn).mousedown(function() {
				if (!self.url) return;
				var zoomIn = $(this).is(self.zoomInBtn);
				self.zoom(zoomIn);
				self.zoomStart(zoomIn);
			});

			$(document).mouseup(function() {
				self.zoomStop();
			});
		},

		drawRotations: function() {
			for (var i = 0; i < 4; i++) {
				var canvas = document.createElement('canvas'),
					context = canvas.getContext('2d'),
					height = (i % 2 ? this.cropping.width() : this.cropping.height()),
					width = (i % 2 ? this.cropping.height() : this.cropping.width()),
					originX = (i === 1 || i === 2 ? width : 0),
					originY = (i === 2 || i === 3 ? height : 0);

				canvas.height = height;
				canvas.width = width;
				context.translate(originX, originY);
				context.rotate(90 * i * Math.PI / 180);
				context.drawImage(this.cropping[0], 0, 0);

				this['rotate' + (90 * i)] = toURL(b64toBlob(canvas.toDataURL()));
			}
		},

		exportImg: function() {
			var canvas = document.createElement('canvas'),
				context = canvas.getContext('2d');

			canvas.height = this.window.height();
			canvas.width = this.window.width();
			context.translate(this.x, this.y);
			context.drawImage(this.cropping[0], 0, 0, this.cropping.width(), this.cropping.height());

			exportCallback(canvas.toDataURL());
		},

		handleInput: function(event) {
			var self = this;
			if (!event.currentTarget.files.length) return;

			self.url = toURL(event.currentTarget.files[0]);
			self.imgs.attr('src', self.url).removeAttr('style');
			self.x = self.y = self.rotation = 0;
			self.scale = 100;

			self.imgs.hide();
			self.throbber.show();
			self.cropping[0].onload = function() {
				self.height = $(this).height();
				self.width = $(this).width();
				self.x = -((self.width - self.window.width()) / 2);
				self.y = -((self.height - self.window.height()) / 2);
				self.verifyCoords([self.x, self.y]);
				self.throbber.hide();
				self.setSize(self.height, self.width);
				self.imgs.show();
				self.drawRotations();
			};
		},

		rotate: function(rotateRight) {
			var self = this;
			self.rotation = (rotateRight ? (self.rotation + 90) % 360 : (270 + this.rotation) % 360);
			self.imgs.attr('src', self['rotate' + self.rotation]);
			self.cropping[0].onload = function() {
				var temp = self.height;
				self.height = self.width;
				self.width = temp;
				self.setSize(self.cropping.width(), self.cropping.height());
			};
		},

		verifyCoords: function(coords) {
			var newX = coords[0],
				newY = coords[1],
				verticalMin = Math.min(30, this.cropping.height()),
				horizontalMin = Math.min(30, this.cropping.width());

			if (newY > this.el.height() - verticalMin) newY = this.el.height() - verticalMin;
			if (newX > this.el.width() - horizontalMin) newX = this.el.width() - horizontalMin;
			if (newY + this.cropping.height() < verticalMin) newY = -this.cropping.height() + verticalMin;
			if (newX + this.cropping.width() < horizontalMin) newX = -this.cropping.width() + horizontalMin;

			this.imgs.css({
				top: newY,
				left: newX
			});

			this.x = newX;
			this.y = newY;
		},

		zoom: function(zoomIn) {
			this.scale = (zoomIn
							? Math.min(this.scale + (this.scale / 80 + 0.2), 400)
							: Math.max(this.scale - (this.scale / 80 + 0.2), 5));

			this.setSize(this.height * (this.scale / 100), this.width * (this.scale / 100));
		},

		zoomStart: function(zoomIn) {
			var self = this;
			self.zoomStop();
			self.zoomInterval = window.setInterval(function() {
				self.zoom(zoomIn)
			}, 3);
		},
		zoomStop: function() {
			window.clearInterval(this.zoomInterval);
		},

		setSize: function(height, width) {
			var initialHeight = this.cropping.height(),
				initialWidth = this.cropping.width();

			this.imgs.css({
				height: height,
				width: width
			});

			// Center the imgs
			this.x += (initialWidth - width) / 2;
			this.y += (initialHeight - height) / 2;
			this.verifyCoords([this.x, this.y]);
		},


		get elLeft() {
			return this.el.offset().left;
		},
		get elTop() {
			return this.el.offset().top;
		},
		get html() {
			return '<div class="pic-up-window"><img class="pic-up-crop"><div class="throbber"></div></div><img class="pic-up-full">';
		},
		get imgs() {
			return this.cropping.add(this.full);
		}
	};

	var instances = [],
		exportCallback = function(data) {
			console.log(toURL(b64toBlob(data)));
		};

	var PicUp = function() {
		var css = '.pic-up-window { overflow: hidden; position: relative; height: 100%; width: 100%; }'
				+ '.pic-up-crop { cursor: pointer; position: absolute; top: 0; left: 0; z-index: 1; }'
				+ '.pic-up-full { opacity: 0.25; position: absolute; top: 0; left: 0; }';
		var blob = new Blob([css], {type: 'text/css'});
		$('head').append('<link rel="stylesheet" href="' + toURL(blob) + '">');
	};
	PicUp.prototype = {
		up: function(selector, exportCallbackIn) {
			this.instances = $(selector);
			exportCallback = exportCallbackIn;
		},

		toURL: function() {
			return toURL.apply(this, arguments);
		},
		b64toBlob: function() {
			return b64toBlob.apply(this, arguments);
		},

		get instances() { return instances; },
		set instances(els) {
			$.each(els, function() {
				instances.push(new PicUpInstance($(this)));
			});
		}
	};

	window.picUp = new PicUp();
});
