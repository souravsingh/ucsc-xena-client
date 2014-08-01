/*jslint nomen:true, browser: true */
/*global define: false */

define(['stub', 'crosshairs', 'linkTo', 'tooltip', 'util', 'vgcanvas', 'lib/d3', 'jquery', 'lib/underscore'
	// non-object dependencies
	], function (stub, crosshairs, linkTo, tooltip, util, vgcanvas, d3, $, _) {
	'use strict';

	var impactMax = 3,
		highlightRgba = 'rgba(0, 0, 0, 1)',
		impact = {
			stop_gained: 3,
			splice_acceptor_variant: 3,
			splice_donor_variant: 3,
			frameshift_variant: 3,
			splice_region_variant: 3,
			missense: 2,
			missense_variant: 2,
			non_coding_exon_variant: 2,
			exon_variant: 2,
			stop_lost: 1,
			start_gained: 1,
			initiator_codon_variant: 1,
			'5_prime_UTR_premature_start_codon_gain_variant': 1,
			disruptive_inframe_deletion: 1,
			inframe_deletion: 1,
			inframe_insertion: 1,
			'5_prime_UTR_variant': 0,
			'3_prime_UTR_variant': 0,
			synonymous_variant: 0,
			stop_retained_variant: 0,
			upstream_gene_variant: 0,
			downstream_gene_variant: 0,
			intron_variant: 0,
			intergenic_region: 0
		},
		impactLabels = [
			'silent or outside CDS',
			'NOT_USED',
			'missense or non-coding',
			'nonsense or splice site'
		],
		colors = {
			grey_green_blue_red: [
				{r: 0, g: 0, b: 0, a: 0.1},
				{r: 0, g: 255, b: 0, a: 0.3},
				{r: 0, g: 0, b: 255, a: 0.2},
				{r: 255, g: 0, b: 0, a: 0.6}
			],
			category_50: [
				{r: 255, g: 255, b: 153, a: 1},
				{r: 166, g: 215, b: 165, a: 1},
				{r: 155, g: 191, b: 220, a: 1},
				{r: 242, g: 141, b: 142, a: 1}
			],
			category_25: [
				{r: 235, g: 255, b: 102, a: 1},
				{r: 122, g: 195, b: 119, a: 1},
				{r: 105, g: 158, b: 202, a: 1},
				{r: 235, g: 83, b: 85, a: 1}
			],
			category_0: [
				{r: 255, g: 255, b: 51, a: 1},
				{r: 77, g: 175, b: 74, a: 1},
				{r: 55, g: 126, b: 184, a: 1},
				{r: 228, g: 26, b: 28, a: 1}
			],
			scale_25: [
				{r: 255, g: 255, b: 102, a: 1},
				{r: 255, g: 207, b: 83, a: 1},
				{r: 255, g: 159, b: 64, a: 1},
				{r: 235, g: 83, b: 85, a: 1}
			],
			category_transparent_25: [
				{r: 235, g: 255, b: 102, a: 0.5},
				{r: 122, g: 195, b: 119, a: 0.5},
				{r: 105, g: 158, b: 202, a: 0.5},
				{r: 235, g: 83, b: 85, a: 0.5}
			],
			category_line: [
				{r: 255, g: 255, b: 51, a: 1, line: true},
				{r: 77, g: 175, b: 74, a: 1, line: true},
				{r: 55, g: 126, b: 184, a: 1, line: true},
				{r: 228, g: 26, b: 28, a: 1, line: true}
			],
			category_gradient: [
				{r: 255, g: 255, b: 51, a: 1, gradient: true},
				{r: 77, g: 175, b: 74, a: 1, gradient: true},
				{r: 55, g: 126, b: 184, a: 1, gradient: true},
				{r: 228, g: 26, b: 28, a: 1, gradient: true}
			],
			duplicate_checker: [
				{r: 16, g: 16, b: 16, a: 0.2},
				{r: 0, g: 255, b: 0, a: 0.2},
				{r: 0, g: 0, b: 255, a: 0.2},
				{r: 255, g: 0, b: 0, a: 0.2}
			],
			dataset: {
				'TCGA_LUAD_mutation_RADIA':
					{r: 0, g: 0, b: 255, a: 0.5},
				'TCGA_UCEC_mutation_RADIA':
					{r: 0, g: 255, b: 0, a: 0.5 },
				'8132-002-NWMS-CO_somaticNonSilentSNP':
					{r: 255, g: 0, b: 0, a: 0.5 }
			},
			af: [
				{r: 228, g: 26, b: 28, a: 0},
				{r: 228, g: 26, b: 28, a: 0.5},
				{r: 228, g: 26, b: 28, a: 1}
			]
		},
		clone = _.clone,
		each = _.each,
		filter = _.filter,
		find = _.find,
		map = _.map,
		reduce = _.reduce,
		sortBy = _.sortBy,
		toNumber = _.toNumber,
		uniqueId = _.uniqueId,
		widgets = {},
		aWidget = {

			destroy: function () {
				this.sub.dispose();
				delete widgets[this.id];
			},

			error: function (message) {
				console.log(message); // TODO
			},

			click: function (e) {
				// classic
				// If the mouse has moved between mouseup and mousedown...
				//if (!e.shiftKey || this.heatmapImgPageX !== e.pageX || this.heatmapImgPageY !== e.pageY) {
				if (!e.shiftKey) {
					return;
				}
				tooltip.toggleFreeze(); // TODO make this part of tooltip code ?
			},

			drawCenter: function (d, highlight) {
				var r = highlight ? this.point * 2 : this.point;
				this.vg.circle(d.x, d.y, r, 'black');
			},

			drawHalo: function (d) {
				this.vg.circle(d.x, d.y, d.r, d.rgba);
			},

			draw: function () {
				var self = this,
					buffWidth = this.canvasWidth - (this.sparsePad * 2),
					buff = vgcanvas(buffWidth, 1);
				this.vg.smoothing(false);
				this.vg.clear(0, 0, this.canvasWidth, this.canvasHeight);

				// draw each of the rows either grey for NA or white for sample examined for mutations
				each(this.values, function (r, i) {
					var color = (r.vals) ? 'white' : 'grey';
					buff.box(0, 0, buffWidth, 1, color);
					self.vg.drawImage(
						buff.element(),
						self.sparsePad,
						(i * self.pixPerRow) + self.sparsePad,
						buffWidth,
						self.pixPerRow
					);
				});

				// draw the mutations
				each(this.nodes, function (d) {
					self.drawHalo(d);
				});
				each(this.nodes, function (d) { // draw black dots on top
					self.drawCenter(d);
				});
			},

			highlight: function (d) {
				this.draw(); // remove any previous highlights
				this.vg.circle(d.x, d.y, d.r, highlightRgba, true);
				this.drawHalo(d); // to bring this node's color to the top
				this.drawCenter(d, true);
			},

			closestNode: function (x, y) { // XXX this should be optimized for a large number of mutations
				var node,
					sortedNodes,
					nodes = map(this.nodes, function (n, i) {
						var node = clone(n);
						node.distance = Math.sqrt(Math.pow((x - n.x), 2) + Math.pow((y - n.y), 2));
						return node;
					}),
					closeNodes = filter(nodes, function (n, i) {
						return (n.distance < n.r);
					});
				if (closeNodes.length === 0) {
					node = undefined;
				} else if (closeNodes.length === 1) {
					node = closeNodes[0];
				} else {
					sortedNodes = sortBy(closeNodes, function (n, i) {
						//console.log('distance, sample: ' + n.distance + ', ' + n.data.sample);
						return n.distance;
					});
					node = sortedNodes[0];
				}
				return node;
			},

			formatAf: function (af) {
				if (af === 'NA') {
					return 'NA';
				} else {
					return Math.round(af * 100) + '%';
				}
			},

			mousing: function (ev) {
				var x,
					y,
					pos = {},
					node,
					vals = [],
					mode = 'genesets',
					offsetX = ev.offsetX,
					offsetY = ev.offsetY,
					offset;
				if (tooltip.frozen()) {
					return;
				}
				if (offsetX === undefined) { // fix up for firefox
					offset = util.eventOffset(ev);
					offsetX = offset.x;
					offsetY = offset.y;
				}
				x = offsetX;
				y = offsetY;
				node = this.closestNode(x, y);
				if (node) {
					this.highlight(node);
					pos.geneName = this.gene.name;
					pos.chrom = node.data.chr;
					pos.start = node.data.start;
					pos.end = node.data.end;
					vals = [
						{label: 'Base change', val: node.data.reference + ' > ' + node.data.alt},
						{label: 'Amino acid change', val: node.data.Amino_Acid_Change},
						{label: 'Effect', val: node.data.effect},
						{label: 'DNA allele frequency', val: this.formatAf(node.data.DNA_AF)},
						{label: 'RNA allele frequency', val: this.formatAf(node.data.RNA_AF)}
					];
					tooltip.mutation({
						ev: ev,
						pos: pos,
						dsID: node.data.dataset,
						sampleID: node.data.sample,
						el: '#nav',
						my: 'top',
						at: 'top',
						mode: mode,
						vals: vals
					});
				} else {
					if (!tooltip.frozen()) {
						tooltip.hide();
						this.draw();
					}
				}
			},

			mupitClick: function () {
				var self = this,
					nodes =  _.filter(self.nodes, function (n) {
						return (n.impact === 2);
					}),
					positions = _.map(nodes, function (n, i) {
						return n.data.chr + ' ' + (n.data.start + 1).toString();
					});
				linkTo.mupit(positions.join('\n'));
			},

			findLegend: function () {
				var featureColors,
					legendColors,
					labels,
					barLabel,
					tooltips;
				if (this.feature === 'impact') {
					barLabel = 'Impact:';
					featureColors = [
						colors[this.color][0],
						colors[this.color][2],
						colors[this.color][3]
					];
					labels = [
						'mild',
						'',
						'severe'
					];
				} else if (this.feature === 'dataset') {
					barLabel = 'Dataset:';
					featureColors = colors.dataset;
					labels = ['LUAD', 'UCEC', 'CCI'];
				} else {
					if (this.feature === 'DNA_AF') {
						barLabel = 'DNA Allele Frequency:';
					} else {
						barLabel = 'RNA Allele Frequency:';
					}
					featureColors = colors.af;
					labels = ['0%', '50%', '100%'];
				}
				legendColors = map(featureColors, function (c) {
					return 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + c.a.toString() + ')';
				});
				return {barLabel: barLabel, colors: legendColors, labels: labels, tooltips: impactLabels};
			},

			findLine: function (val) {
				var imp, line;
				if (this.feature === 'impact') {
					imp = impact[val.effect];
					line = colors[this.color][imp].line;
				}
				return line;
			},

			findGradient: function (val) {
				var imp, gradient;
				if (this.feature === 'impact') {
					imp = impact[val.effect];
					gradient = colors[this.color][imp].gradient;
				}
				return gradient;
			},

			findRgba: function (val) {
				var imp,
					c;
				if (this.feature === 'impact') {
					imp = impact[val.effect];
					c = colors[this.color][imp];
				//} else if (this.feature === 'dataset') {
				//	c = colors.dataset[val.dataset];
				} else if (val[this.feature] === 'NA') { // DNA_AF or RNA_AF with NA value
					c = colors.af[0];
				} else {  // DNA_AF or RNA_AF, but not NA
					c = clone(colors.af[1]);
					c.a = (this.feature === 'DNA_AF') ? val.DNA_AF : val.RNA_AF;
				}
				return 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + c.a.toString() + ')';
			},

			receiveData: function (data) {
				var drawValues = data.slice(this.zoomIndex, this.zoomIndex + this.zoomCount);
				this.values = _.map(drawValues, function (v, i) {
					var row = $.extend(true, [], v);
					row.index = i;
					return row;
				});
				this.render();
			},

			findNonNaRows: function () {
				var self = this,
					nonNaRows = _.map(filter(self.values, function (r) {
						return r.vals;
					}), function (r) {
						return {
							x: self.sparsePad,
							y: r.index * self.pixPerRow + self.sparsePad
						};
					});
				return nonNaRows;
			},

			findNodes: function () {
				var self = this,
					nodes = [],
					nodeValues = _.filter(this.values, function (value) {
						return value.vals && value.vals.length;
					});
				_.each(nodeValues, function (value) {
					var y = (value.index * self.pixPerRow) + (self.pixPerRow / 2) + self.sparsePad;
					_.each(value.vals, function (val) {
						var x = (self.refGene.mapChromPosToX(val.start) * self.gene.scaleX) + self.sparsePad;
						if (x >= 0) {
							nodes.push({
								x: x,
								y: y,
								r: self.radius,
								impact: impact[val.effect],
								rgba: self.findRgba(val),
								line: self.findLine(val),
								gradient: self.findGradient(val),
								data: val
							});
						}
					});
				});

				// sort so most severe draw on top
				return sortBy(nodes, function (n) {
					return n.impact;
				});
			},

			render: function () {
				var self = this;
				this.pixPerRow = (this.height - (this.sparsePad * 2))  / this.values.length;
				this.canvasHeight = this.height; // TODO init elsewhere
				this.d2 = this.vg.context();

				this.nodes = this.findNodes();
				this.nonNaRows = this.findNonNaRows();
				this.draw();
			},

			initialize: function (options) {
				var horizontalMargin = '-' + options.horizontalMargin.toString() + 'px';
				_.bindAll.apply(_, [this].concat(_.functions(this)));
				//_(this).bindAll();
				this.vg = options.vg;
				this.columnUi = options.columnUi;
				this.refGene = options.refGene;
				this.dataset = options.dataset;
				this.gene = options.refGene.getGeneInfo();
				this.feature = options.feature;
				this.color = options.color;
				this.canvasWidth = options.width;
				this.height = options.height;
				this.zoomCount = options.zoomCount;
				this.zoomIndex = options.zoomIndex;
				this.sparsePad = options.sparsePad;
				this.radius = options.radius;
				this.point = options.point;
				this.refHeight = options.refHeight;
				this.columnUi.$sparsePad.height(0);
				this.columnUi.$el.parent().css({
					'margin-left': horizontalMargin,
					'margin-right': horizontalMargin
				});

				// bindings
				this.columnUi.$samplePlot
					.on('click', 'canvas', this.click);
				this.sub = this.columnUi.crosshairs.mousingStream.subscribe(this.mousing);

				this.receiveData(options.data);
			}
		};

	function create(id, options) {
		var w = Object.create(aWidget);
		w.id = id;
		w.initialize(options);
		return w;
	}

	return {
		mupitClick: function (id) {
			if (widgets[id]) {
				widgets[id].mupitClick();
			}
		},

		cmpValue: function (row) {
			var chrEnd = 10000000000,  // TODO some number larger than use max number of base pairs of longest genes
				mut,
				weight;
			if (row.length) {
				mut = _.max(row, function (mut) { return impact[mut.effect]; });
				weight = impactMax - impact[mut.effect];
				return (weight * chrEnd) - mut.start;
			} else {
				return (impactMax * chrEnd) + chrEnd + 1; // force mutation-less rows to the end
			}
		},

		show: function (id, options) {
			if (widgets[id]) {
				widgets[id].destroy();
			}
			widgets[id] = create(id, options);
			return widgets[id];
		}
	};
});
