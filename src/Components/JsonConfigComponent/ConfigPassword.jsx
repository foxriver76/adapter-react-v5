import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';

import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

import I18n from './wrapper/i18n';

import ConfigGeneric from './ConfigGeneric';

const styles = theme => ({
    fullWidth: {
        width: '100%',
        display: 'inline-block',
    },
    halfWidth1: {
        width: `calc(50% - ${theme.spacing(0.5)})`,
        display: 'inline-block',
        marginRight: theme.spacing(1),
    },
    halfWidth2: {
        width: `calc(50% - ${theme.spacing(0.5)})`,
        display: 'inline-block',
    },
});

const PASSWORD_PLACEHOLDER = '____ppp____';

class ConfigPassword extends ConfigGeneric {
    componentDidMount() {
        super.componentDidMount();
        const value = ConfigGeneric.getValue(this.props.data, this.props.attr);
        this.setState({
            _repeat: value ? PASSWORD_PLACEHOLDER : '',
            _visible: false,
            value: value ? PASSWORD_PLACEHOLDER : '',
            _notEqual: false,
        });
    }

    onChangePassword(password, repeatPassword) {
        if (password === undefined) {
            password = this.state.value;
        }
        if (repeatPassword === undefined) {
            repeatPassword = this.state._repeat;
        }
        const _notEqual = !!this.props.schema.repeat && repeatPassword !== password;
        this.setState({ value: password, _repeat: repeatPassword, _notEqual }, () => {
            if (_notEqual) {
                this.onError(this.props.attr, I18n.t('ra_Passwords are not equal!'));
            } else {
                this.onError(this.props.attr); // clear error
                this.onChange(this.props.attr, password);
            }
        });
    }

    renderItem(error, disabled /* , defaultValue */) {
        if (this.state._notEqual === undefined) {
            return null;
        }

        const password = <TextField
            variant="standard"
            fullWidth
            type={this.state._visible && this.state.value !== PASSWORD_PLACEHOLDER ? 'text' : 'password'}
            value={this.state.value}
            error={!!error || this.state._notEqual}
            disabled={!!disabled}
            onChange={e => this.onChangePassword(e.target.value)}
            label={this.getText(this.props.schema.label)}
            inputProps={{
                autoComplete: 'new-password',
                form: { autoComplete: 'off' },
                maxLength: this.props.schema.maxLength || this.props.schema.max || undefined,
            }}
            helperText={this.state._notEqual ? I18n.t('ra_Passwords are not equal!') : this.renderHelp(this.props.schema.help, this.props.schema.helpLink, this.props.schema.noTranslation)}
            // eslint-disable-next-line react/jsx-no-duplicate-props
            InputProps={{
                endAdornment: this.state.value && this.state.value !== PASSWORD_PLACEHOLDER && this.props.schema.visible ? <InputAdornment position="end">
                    <IconButton
                        size="large"
                        tabIndex={-1}
                        onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.setState({ _visible: !this.state._visible });
                        }}
                        edge="end"
                    >
                        {this.state._visible ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                </InputAdornment> : undefined,
            }}
        />;

        if (this.props.schema.repeat) {
            const passwordRepeat = <TextField
                variant="standard"
                fullWidth
                type={this.state._visible && this.state._repeat !== PASSWORD_PLACEHOLDER ? 'text' : 'password'}
                value={this.state._repeat}
                error={!!error || this.state._notEqual}
                disabled={!!disabled}
                onChange={e => this.onChangePassword(undefined, e.target.value)}
                label={`${this.getText(this.props.schema.label)} (${I18n.t('ra_repeat')})`}
                inputProps={{
                    autoComplete: 'new-password',
                    form: { autoComplete: 'off' },
                    maxLength: this.props.schema.maxLength || this.props.schema.max || undefined,
                }}
                helperText={this.state._notEqual ? I18n.t('ra_Passwords are not equal!') : this.renderHelp(this.props.schema.help, this.props.schema.helpLink, this.props.schema.noTranslation)}
                // eslint-disable-next-line react/jsx-no-duplicate-props
                InputProps={{
                    endAdornment: this.state._repeat && this.state._repeat !== PASSWORD_PLACEHOLDER ? <InputAdornment position="end">
                        <IconButton
                            size="large"
                            tabIndex={-1}
                            onClick={e => {
                                e.preventDefault();
                                e.stopPropagation();
                                this.setState({ _visible: !this.state._visible });
                            }}
                            edge="end"
                        >
                            {this.state._visible ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                    </InputAdornment> : undefined,
                }}
            />;

            return <div className={this.props.classes.fullWidth}>
                <div className={this.props.classes.halfWidth1}>{password}</div>
                <div className={this.props.classes.halfWidth2}>{passwordRepeat}</div>
            </div>;
        }
        return password;
    }
}

ConfigPassword.propTypes = {
    socket: PropTypes.object.isRequired,
    themeType: PropTypes.string,
    themeName: PropTypes.string,
    style: PropTypes.object,
    className: PropTypes.string,
    data: PropTypes.object.isRequired,
    schema: PropTypes.object,
    onError: PropTypes.func,
    onChange: PropTypes.func,
};

export default withStyles(styles)(ConfigPassword);
