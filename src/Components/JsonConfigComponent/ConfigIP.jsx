import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormHelperText from '@mui/material/FormHelperText';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';

import I18n from './wrapper/i18n';

import ConfigGeneric from './ConfigGeneric';

const styles = () => ({
    fullWidth: {
        width: '100%'
    }
});

class ConfigIP extends ConfigGeneric {

    componentDidMount() {
        super.componentDidMount();
        this.props.socket.getHostByIp(this.props.common.host)
            .then(ips => {
                // [{name, address, family}]
                if (!this.props.schema.listenOnAllPorts) {
                    ips = ips.filter(item => item.address !== '0.0.0.0' && item.address !== '::');
                }
                if (this.props.schema.onlyIp4) {
                    ips = ips.filter(item => item.family === 'ipv4');
                } else
                if (this.props.schema.onlyIp6) {
                    ips = ips.filter(item => item.family === 'ipv6');
                }
                ips.forEach(item => {
                    if (item.address === '0.0.0.0') {
                        item.name = '[IPv4] 0.0.0.0 - ' + I18n.t('ra_Listen on all IPs');
                    } else
                    if (item.address === '::') {
                        item.name = '[IPv6] :: - ' + I18n.t('ra_Listen on all IPs');
                    }
                });
                this.setState({ips});
            });
    }

    renderItem(error, disabled, defaultValue) {
        const value = ConfigGeneric.getValue(this.props.data, this.props.attr);
        const item = this.state.ips?.find(item => item.address === value);

        return <FormControl className={this.props.classes.fullWidth} variant="standard">
            {this.props.schema.label ? <InputLabel>{this.getText(this.props.schema.label)}</InputLabel> : null}
            <Select
                variant="standard"
                error={!!error}
                disabled={!!disabled}
                value={value}
                renderValue={val => item?.name || val}
                onChange={e => this.onChange(this.props.attr, e.target.value)}
            >
                {this.state.ips?.map((item, i) =>
                    <MenuItem key={i} value={item.address}>{item.name}</MenuItem>)}
            </Select>
            {this.props.schema.help ? <FormHelperText>{this.renderHelp(this.props.schema.help, this.props.schema.helpLink, this.props.schema.noTranslation)}</FormHelperText> : null}
        </FormControl>;
    }
}

ConfigIP.propTypes = {
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

export default withStyles(styles)(ConfigIP);