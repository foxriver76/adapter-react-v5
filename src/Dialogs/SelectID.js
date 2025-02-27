/**
 * Copyright 2018-2022 bluefox <dogafox@gmail.com>
 *
 * MIT License
 *
 **/
// please do not delete React, as without it other projects could not be compiled: ReferenceError: React is not defined
import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import Button from '@mui/material/Button';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Dialog from '@mui/material/Dialog';

import IconCancel from '@mui/icons-material/Cancel';
import IconOk from '@mui/icons-material/Check';

import Utils from '../Components/Utils';
import I18n from '../i18n';
import ObjectBrowser from '../Components/ObjectBrowser';

const styles = () => ({
    headerID: {
        fontWeight: 'bold',
        fontStyle: 'italic',
    },
    dialog: {
        height: '95%',
    },
    dialogMobile: {
        padding: 4,
        width: '100%',
        maxWidth: '100%',
        maxHeight: 'calc(100% - 16px)',
        height: '100%',
    },
    content: {
        height: '100%',
        overflow: 'hidden',
    },
    contentMobile: {
        padding: '8px 4px',
    },
    titleRoot: {
        whiteSpace: 'nowrap',
        width: 'calc(100% - 72px)',
        overflow: 'hidden',
        display: 'inline-block',
        textOverflow: 'ellipsis',
    },
});

/**
 * @typedef {object} DialogSelectIDProps
 * @property {string} [dialogName] The internal name of the dialog; default: "default"
 * @property {string} [title] The dialog title; default: Please select object ID... (translated)
 * @property {boolean} [multiSelect] Set to true to allow the selection of multiple IDs.
 * @property {boolean} [foldersFirst] Show folders before any leaves.
 * @property {string} [imagePrefix] Prefix (default: '.')
 * @property {boolean} [showExpertButton] Show the expert button?
 * @property {import('../Components/types').ObjectBrowserColumn[]} [columns] Columns to display; default: 'name', 'type', 'role', 'room', 'func', 'val'
 * @property {import('../Components/types').ObjectBrowserType[]} [types] Object types to show; default: 'state' only
 * @property {ioBroker.Languages} [lang] The language.
 * @property {import('../Connection').default} socket The socket connection.
 * @property {boolean} [notEditable] Can't objects be edited? (default: true)
 * @property {string} [themeName] Theme name.
 * @property {string} [themeType] Theme type.
 * @property {import('../Components/types').ObjectBrowserCustomFilter} [customFilter] Custom filter.
 * @property {string | string[]} [selected] The selected IDs.
 * @property {string} [ok] The ok button text; default: OK (translated)
 * @property {string} [cancel] The cancel button text; default: Cancel (translated)
 * @property {() => void} onClose Close handler that is always called when the dialog is closed.
 * @property {(selected: string | string[] | undefined, name: string) => void} onOk Handler that is called when the user presses OK.
 * @property {{headerID: string; dialog: string; content: string}} [classes] The styling class names.
 *
 * @extends {React.Component<DialogSelectIDProps>}
 */
class DialogSelectID extends React.Component {
    /**
     * @param {DialogSelectIDProps} props
     */
    constructor(props) {
        super(props);
        this.dialogName = this.props.dialogName || 'default';
        this.dialogName = `SelectID.${this.dialogName}`;

        this.filters = (window._localStorage || window.localStorage).getItem(this.dialogName) || '{}';

        try {
            this.filters = JSON.parse(this.filters);
        } catch (e) {
            this.filters = {};
        }

        if (props.filters) {
            this.filters = { ...this.filters, ...props.filters };
        }

        let selected = this.props.selected || [];
        if (typeof selected !== 'object') {
            selected = [selected];
        }
        selected = selected.filter(id => id);

        this.state =  {
            selected,
            name: '',
        };
    }

    handleCancel() {
        this.props.onClose();
    }

    handleOk() {
        this.props.onOk(this.props.multiSelect ? this.state.selected : this.state.selected[0] || '', this.state.name);
        this.props.onClose();
    }

    render() {
        let title;
        if (this.state.name || this.state.selected.length) {
            if (this.state.selected.length === 1) {
                title = [
                    <span key="selected">
                        {I18n.t('ra_Selected')}
                        &nbsp;
                    </span>,
                    <span key="id" className={this.props.classes.headerID}>
                        {(this.state.name || this.state.selected) + (this.state.name ? ` [${this.state.selected}]` : '')}
                    </span>,
                ];
            } else {
                title = [
                    <span key="selected">
                        {I18n.t('ra_Selected')}
                        &nbsp;
                    </span>,
                    <span key="id" className={this.props.classes.headerID}>
                        {I18n.t('%s items', this.state.selected.length)}
                    </span>,
                ];
            }
        } else {
            title = this.props.title || I18n.t('ra_Please select object ID...');
        }

        return <Dialog
            onClose={() => {}}
            maxWidth={false}
            classes={{ paper: Utils.clsx(this.props.classes.dialog, this.props.classes.dialogMobile) }}
            fullWidth
            open={!0}
            aria-labelledby="ar_dialog_selectid_title"
        >
            <DialogTitle id="ar_dialog_selectid_title" classes={{ root: this.props.classes.titleRoot }}>{title}</DialogTitle>
            <DialogContent className={Utils.clsx(this.props.classes.content, this.props.classes.contentMobile)}>
                <ObjectBrowser
                    foldersFirst={this.props.foldersFirst}
                    imagePrefix={this.props.imagePrefix || this.props.prefix} // prefix is for back compatibility
                    defaultFilters={this.filters}
                    dialogName={this.dialogName}
                    showExpertButton={this.props.showExpertButton !== undefined ? this.props.showExpertButton : true}
                    expertMode={this.props.expertMode}
                    style={{ width: '100%', height: '100%' }}
                    columns={this.props.columns || ['name', 'type', 'role', 'room', 'func', 'val']}
                    types={this.props.types || ['state']}
                    root={this.props.root}
                    t={I18n.t}
                    lang={this.props.lang || I18n.getLanguage()}
                    socket={this.props.socket}
                    selected={this.state.selected}
                    multiSelect={this.props.multiSelect}
                    notEditable={this.props.notEditable === undefined ? true : this.props.notEditable}
                    name={this.state.name}
                    themeName={this.props.themeName}
                    themeType={this.props.themeType}
                    customFilter={this.props.customFilter}
                    onFilterChanged={filterConfig => {
                        this.filters = filterConfig;
                        (window._localStorage || window.localStorage).setItem(this.dialogName, JSON.stringify(filterConfig));
                    }}
                    onSelect={(selected, name, isDouble) => {
                        if (JSON.stringify(selected) !== JSON.stringify(this.state.selected)) {
                            this.setState({ selected, name }, () =>
                                isDouble && this.handleOk());
                        } else if (isDouble) {
                            this.handleOk();
                        }
                    }}
                    filterFunc={this.props.filterFunc}
                />
            </DialogContent>
            <DialogActions>
                <Button id={`ar_dialog_selectid_ok_${this.props.dialogName || ''}`} variant="contained" onClick={() => this.handleOk()} startIcon={<IconOk />} disabled={!this.state.selected.length} color="primary">{this.props.ok || I18n.t('ra_Ok')}</Button>
                <Button id={`ar_dialog_selectid_cancel_${this.props.dialogName || ''}`} color="grey" variant="contained" onClick={() => this.handleCancel()} startIcon={<IconCancel />}>{this.props.cancel || I18n.t('ra_Cancel')}</Button>
            </DialogActions>
        </Dialog>;
    }
}

DialogSelectID.propTypes = {
    dialogName: PropTypes.string, // where to store settings in localStorage
    classes: PropTypes.object,
    notEditable: PropTypes.bool,
    onClose: PropTypes.func.isRequired,
    onOk: PropTypes.func.isRequired,
    title: PropTypes.string,
    lang: PropTypes.string,
    foldersFirst: PropTypes.bool,
    selected: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.array,
    ]),
    filters: PropTypes.object, // predefined filter fields, like {"id":"","name":"","room":"","func":"","role":"level","type":"","custom":""}
    customFilter: PropTypes.object, // optional {common: {custom: true}} or {common: {custom: 'sql.0'}}
    socket: PropTypes.object.isRequired,
    cancel: PropTypes.string,
    imagePrefix: PropTypes.string,
    ok: PropTypes.string,
    themeName: PropTypes.string,
    themeType: PropTypes.string,
    showExpertButton: PropTypes.bool,
    expertMode: PropTypes.bool, // force expert mode
    multiSelect: PropTypes.bool,
    types: PropTypes.array,   // optional ['state', 'instance', 'channel']
    columns: PropTypes.array, // optional ['name', 'type', 'role', 'room', 'func', 'val', 'buttons']
    root: PropTypes.string,   // optional. Root of tree. Show only this branch of tree

    filterFunc: PropTypes.func, // function to filter out all unnecessary objects. It cannot be used together with "types"
                                // Example for function: `obj => obj.common && obj.common.type === 'boolean'` to show only boolean states
};

/** @type {typeof DialogSelectID} */
const _export = withStyles(styles)(DialogSelectID);
export default _export;
