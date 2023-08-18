import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import { Button } from '@mui/material';

import {
    Warning as IconWarning,
    Error as IconError,
    Info as IconInfo,
} from '@mui/icons-material';

import ConfigGeneric from './ConfigGeneric';
import I18n from './wrapper/i18n';
import Icon from './wrapper/Components/Icon';
import ConfirmDialog from './wrapper/Dialogs/Confirm';

const styles = () => ({
    fullWidth: {
        width: '100%',
    },
    icon: {
        width: 24,
        height: 24,
        marginRight: 4,
    },
});

class ConfigSetState extends ConfigGeneric {
    async _onClick() {
        let val = this.props.schema.val;
        if (typeof val === 'string' && val.includes('${')) {
            val = this.getPattern(val);
            const obj = await this.props.socket.getObject(this.props.schema.id);
            if (obj?.common?.type === 'number') {
                val = parseFloat(val);
            } else if (obj?.common?.type === 'boolean') {
                val = val === 'true' || val === true || val === '1' || val === 1;
            }
        }

        const id = (this.props.schema.id || '').replace(/%INSTANCE%/g, this.props.instance);

        try {
            await this.props.socket.setState(id, { val, ack: !!this.props.schema.ack });
            this.props.schema.okText && window.alert(this.getText(this.props.schema.okText));
        } catch (e) {
            if (this.props.schema.error && this.props.schema.error[e.toString()]) {
                window.alert(this.getText(this.props.schema.error[e.toString()]));
            } else {
                window.alert(I18n.t(e.toString()) || I18n.t('ra_Error'));
            }
        }
    }

    renderConfirmDialog() {
        if (!this.state.confirmDialog) {
            return null;
        }
        const confirm = this.state.confirmData || this.props.schema.confirm;
        let icon = null;
        if (confirm.type === 'warning') {
            icon = <IconWarning />;
        } else if (confirm.type === 'error') {
            icon = <IconError />;
        } else if (confirm.type === 'info') {
            icon = <IconInfo />;
        }

        return <ConfirmDialog
            title={this.getText(confirm.title) || I18n.t('ra_Please confirm')}
            text={this.getText(confirm.text)}
            ok={this.getText(confirm.ok) || I18n.t('ra_Ok')}
            cancel={this.getText(confirm.cancel) || I18n.t('ra_Cancel')}
            icon={icon}
            onClose={isOk =>
                this.setState({ confirmDialog: false }, () =>
                    isOk && this._onClick())}
        />;
    }

    renderItem(error, disabled /* , defaultValue */) {
        return <Button
            variant={this.props.schema.variant || undefined}
            color={this.props.schema.color || 'grey'}
            className={this.props.classes.fullWidth}
            disabled={disabled}
            onClick={async () => {
                if (this.props.schema.confirm) {
                    this.setState({ confirmDialog: true });
                } else {
                    await this._onClick();
                }
            }}
        >
            {this.props.schema.icon ? <Icon src={this.props.schema.icon} className={this.props.classes.icon} /> : null}
            {this.getText(this.props.schema.label, this.props.schema.noTranslation)}
        </Button>;
    }
}

ConfigSetState.propTypes = {
    socket: PropTypes.object.isRequired,
    themeType: PropTypes.string,
    themeName: PropTypes.string,
    style: PropTypes.object,
    className: PropTypes.string,
    data: PropTypes.object.isRequired,
    schema: PropTypes.object,
    onError: PropTypes.func,
    onChange: PropTypes.func,
    adapterName: PropTypes.string,
    instance: PropTypes.number,
    commandRunning: PropTypes.bool,
    onCommandRunning: PropTypes.func,
};

export default withStyles(styles)(ConfigSetState);
