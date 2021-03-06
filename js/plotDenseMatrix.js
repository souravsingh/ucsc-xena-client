'use strict';

var _ = require('./underscore_ext');
var Rx = require('./rx');
var widgets = require('./columnWidgets');
var colorScales = require('./colorScales');
var util = require('./util');
var Legend = require('./views/Legend');
var React = require('react');
var CanvasDrawing = require('./CanvasDrawing');
var {deepPureRenderMixin, rxEventsMixin} = require('./react-utils');
var drawHeatmap = require('./drawHeatmap');

// Since we don't set module.exports, but instead register ourselves
// with columWidgets, react-hot-loader can't handle the updates automatically.
// Accept hot loading here.
if (module.hot) {
	module.hot.accept();
}

// Since there are multiple components in the file we have to use makeHot
// explicitly.
function hotOrNot(component) {
	return module.makeHot ? module.makeHot(component) : component;
}

var colorFns = vs => _.map(vs, colorScales.colorScale);

//
// Tooltip
//

var prec = (function () {
	var precision = 6,
		factor = Math.pow(10, precision);
	return val => (val == null) ? 'NA' : Math.round((val * factor)) / factor;
}());

// We're getting events with coords < 0. Not sure if this
// is a side-effect of the react event system. This will
// restrict values to the given range.
function bounded(min, max, x) {
	return x < min ? min : (x > max ? max : x);
}

var posString = p => `${p.chrom}:${util.addCommas(p.chromstart)}-${util.addCommas(p.chromend)}`;
//gb position string of the segment with 15bp extra on each side, centered at segment
var posRegionString = p => {
	var pad = (p.chromend - p.chromstart) / 2;
	return `${p.chrom}:${util.addCommas(p.chromstart - pad)}-${util.addCommas(p.chromend + pad)}`;
};
var gbURL = (assembly, pos) => {
	var assemblyString = encodeURIComponent(assembly),
		positionString = encodeURIComponent(posString(pos)),
		regionString = encodeURIComponent(posRegionString(pos));
	return `http://genome.ucsc.edu/cgi-bin/hgTracks?db=${assemblyString}&highlight=${assemblyString}.${positionString}&position=${regionString}`;
};

function tooltip(heatmap, assembly, fields, sampleFormat, fieldFormat, codes, position, width, zoom, samples, ev) {
	var coord = util.eventOffset(ev),
		sampleIndex = bounded(0, samples.length, Math.floor((coord.y * zoom.count / zoom.height) + zoom.index)),
		sampleID = samples[sampleIndex],
		fieldIndex = bounded(0, fields.length, Math.floor(coord.x * fields.length / width)),
		pos = _.get(position, fieldIndex),
		field = fields[fieldIndex];

	var val = _.getIn(heatmap, [fieldIndex, sampleIndex]),
		code = _.get(codes, val),
		label = fieldFormat(field);

	val = code ? code : prec(val);

	return {
		sampleID: sampleFormat(sampleID),
		rows: [
			[['labelValue', label, val]],
			...(pos && assembly ? [[['url', `${assembly} ${posString(pos)}`, gbURL(assembly, pos)]]] : []),
			...(val !== 'NA' && !code ?
				[[['labelValue', 'Mean (Median)', prec(_.meannull(heatmap[fieldIndex])) + ' (' +
				 prec(_.medianNull(heatmap[fieldIndex])) + ')' ]]] : [])]
	};
}

//
// Legends
//

function categoryLegend(dataIn, colorScale, codes) {
	if (!colorScale) {
		return {colors: [], labels: [], align: 'left'};
	}
	// only finds categories for the current data in the column
	var data = _.reject(_.uniq(dataIn), x => x == null).sort((v1, v2) =>  v1 - v2),
		colors = _.map(data, colorScale),
		labels = _.map(data, d => codes[d]);
	return {colors: colors, labels: labels, align: 'left'};
}

// Color scale cases
// Use the domain of the scale as the label.
// If using thresholded scales, add '<' '>' to labels.

var cases = ([tag], arg, c) => c[tag](arg);

function legendForColorscale(colorSpec) {
	var scale = colorScales.colorScale(colorSpec),
		values = scale.domain(),
		colors = _.map(values, scale);

	var labels = cases(colorSpec, values, {
		'no-data': () => [],
		'float': _.identity,
		'float-pos': _.identity,
		'float-neg': _.identity,
		'float-thresh': ([nl, nh, pl, ph]) => [nl, nh, pl, ph],
		'float-thresh-pos': ([low, high]) => [low, high],
		'float-thresh-neg': ([low, high]) => [low, high]
	});

	return {colors, labels};
}

// We never want to draw multiple legends. We only draw the 1st scale
// passed in. The caller should provide labels/colors in the 'legend' prop
// if there are multiple scales.
function renderFloatLegend(props) {
	var {units, colors, vizSettings, defaultNormalization, data} = props;

	if (_.isEmpty(data)) {
		return <Legend colors={[]} labels={''} footnotes={[]}/>;;
	}
	var dataSizeArray = data.map(subcol => subcol.filter(v => v != null).length),
		maxSize = _.max(dataSizeArray),
		maxSubCol = dataSizeArray.indexOf(maxSize),
		{labels, colors: legendColors} = legendForColorscale(colors[maxSubCol]),
		footnotes = (units || []).slice(0),
		normalizationText = "mean is subtracted per column across " + maxSize + " samples",
		hasViz = vizSettings => !isNaN(_.getIn(vizSettings, ['min'])),
		multiScaled = colors && colors.length > 1 && !hasViz(vizSettings);

	if (multiScaled) {
		labels = labels.map((label, i) => {
			if (i === 0) {return "lower";}
			else if(i === labels.length - 1) {return "higher";}
			else {return "";}
		});
	}

	if (vizSettings &&  vizSettings.colNormalization) {
		if (vizSettings.colNormalization === "subset") { // substract mean per subcolumn
			footnotes.push(normalizationText);
		}
	} else if (defaultNormalization) {
		footnotes.push(normalizationText);
	}

	return <Legend colors={legendColors} labels={labels} footnotes={footnotes}/>;
}

// Might have colorScale but no data (phenotype), no data & no colorScale,
// or data & colorScale, no colorScale &  data?
function renderCodedLegend(props) {
	var {data: [data] = [], codes, colors = []} = props;
	var legendProps;
	var colorfn = _.first(colorFns(colors.slice(0, 1)));

	// We can use domain() for categorical, but we want to filter out
	// values not in the plot. Also, we build the categorical from all
	// values in the db (even those not in the plot) so that colors will
	// match in other datasets.
	if (data && colorfn) { // category
		legendProps = categoryLegend(data, colorfn, codes);
	} else {
		return <span />;
	}

	return <Legend {...legendProps} />;
}

var HeatmapLegend = hotOrNot(React.createClass({
	mixins: [deepPureRenderMixin],
	render: function() {
		var {column, data} = this.props,
			{units, heatmap, colors, legend, valueType, vizSettings, defaultNormalization} = column,
			props = {
				units,
				colors,
				legend,
				vizSettings,
				defaultNormalization,
				data: heatmap,
				coded: valueType === 'coded',
				codes: _.get(data, 'codes'),
			};
		return (props.coded ? renderCodedLegend : renderFloatLegend)(props);
	}
}));

//
// plot rendering
//


var HeatmapColumn = hotOrNot(React.createClass({
	mixins: [rxEventsMixin, deepPureRenderMixin],
	componentWillMount: function () {
		this.events('mouseout', 'mousemove', 'mouseover');

		// Compute tooltip events from mouse events.
		this.ttevents = this.ev.mouseover.filter(ev => util.hasClass(ev.currentTarget, 'Tooltip-target'))
			.flatMap(() => {
				return this.ev.mousemove
					.takeUntil(this.ev.mouseout)
					.map(ev => ({
						data: this.tooltip(ev),
						open: true
					})) // look up current data
					.concat(Rx.Observable.of({open: false}));
			}).subscribe(this.props.tooltip);
	},
	componentWillUnmount: function () {
		this.ttevents.unsubscribe();
	},
	tooltip: function (ev) {
		var {samples, data, column, zoom, sampleFormat, fieldFormat, id} = this.props,
			codes = _.get(data, 'codes'),
			position = _.getIn(data, ['req', 'position']),
			{assembly, fields, heatmap, width} = column;
		return tooltip(heatmap, assembly, fields, sampleFormat, fieldFormat(id), codes, position, width, zoom, samples, ev);
	},
	// To reduce this set of properties, we could
	//    - Drop data & move codes into the 'display' obj, outside of data
	// Might also want to copy fields into 'display', so we can drop req probes
	render: function () {
		var {data, column, zoom} = this.props,
			{heatmap, colors} = column,
			codes = _.get(data, 'codes');

		return (
			<CanvasDrawing
					ref='plot'
					draw={drawHeatmap}
					wrapperProps={{
						className: 'Tooltip-target',
						onMouseMove: this.on.mousemove,
						onMouseOut: this.on.mouseout,
						onMouseOver: this.on.mouseover,
						onClick: this.props.onClick
					}}
					codes={codes}
					width={_.get(column, 'width')}
					zoom={zoom}
					colors={colors}
					heatmapData={heatmap}/>);
	}
}));

var getColumn = props => <HeatmapColumn {...props} />;

widgets.column.add("probes", getColumn);
widgets.column.add("geneProbes", getColumn);
widgets.column.add("genes", getColumn);
widgets.column.add("clinical", getColumn);

var getLegend = props => <HeatmapLegend {...props} />;

widgets.legend.add('probes', getLegend);
widgets.legend.add('geneProbes', getLegend);
widgets.legend.add('genes', getLegend);
widgets.legend.add('clinical', getLegend);
