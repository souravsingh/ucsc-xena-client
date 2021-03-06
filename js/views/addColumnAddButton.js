'use strict';
var React = require('react');
// XXX move ColumnEdit2 to views?
var ColumnEdit = require('../ColumnEdit2');
var Button = require('react-bootstrap/lib/Button');
var Tooltip = require('react-bootstrap/lib/Tooltip');
var OverlayTrigger = require('react-bootstrap/lib/OverlayTrigger');
var {deepPureRenderMixin} = require('../react-utils');

function addColumnAddButton(Component) {
	return React.createClass({
		mixins: [deepPureRenderMixin],
		displayName: 'SpreadsheetColumnAdd',
		getInitialState() {
			return {
				openColumnEdit: !this.props.appState.cohort[0] && !this.props.appState.loadPending,
			};
		},
		componentWillReceiveProps: function(newProps) {
			// If we had a cohort but lost it (e.g. due to change in servers),
			// and the columnEdit is closed: open it.
			if (!this.state.openColumnEdit &&
				this.props.appState.cohort[0] &&
				!newProps.appState.cohort[0]) {

				this.setState({openColumnEdit: true});
			}
		},
		onShow() {
			this.setState({openColumnEdit: true});
		},
		onHide() {
			this.setState({openColumnEdit: false});
		},
		render() {
			// XXX appState?
			var {appState} = this.props,
				{cohort, zoom: {height}} = appState,
				{openColumnEdit} = this.state,
				addHelp = <Tooltip>Add a column</Tooltip>;
			return (
				<Component {...this.props}>
					{this.props.children}
					<div style={{height: height}}
						className='addColumn Column'>

						{cohort[0] ?
							<OverlayTrigger placement='left' overlay={addHelp}>
								<Button
									bsStyle= "primary"
									onClick={this.onShow}
									className='Column-add-button'>
									+ Data
								</Button>
							</OverlayTrigger> : null}
					</div>
					{openColumnEdit ?
						<ColumnEdit
							{...this.props}
							onHide={this.onHide}/> : null}
				</Component>);
		}
	});
}

module.exports = addColumnAddButton;
