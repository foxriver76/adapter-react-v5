import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import {
    InputLabel,
    MenuItem,
    FormControl,
    Select,
} from '@mui/material';

import ConfigGeneric from './ConfigGeneric';
import I18n from './wrapper/i18n';

const styles = () => ({
    fullWidth: {
        width: '100%',
    },
    leWidth: {
        width: 620,
        marginBottom: 10,
    },
    certWidth: {
        width: 200,
        marginRight: 10,
    },
});

class ConfigCertificates extends ConfigGeneric {
    async componentDidMount() {
        super.componentDidMount();
        const certificates = await this.props.socket.getCertificates();
        const certsPublicOptions = [];
        const certsPrivateOptions = [];
        const certsChainOptions = [];

        let collectionsOptions = await this.props.socket.getObject('system.certificates');
        if (collectionsOptions?.native?.collections) {
            collectionsOptions = Object.keys(collectionsOptions.native.collections);
        } else {
            collectionsOptions = null;
        }

        certificates
            .forEach(el => {
                if (el.type === 'public') {
                    certsPublicOptions.push({ label: el.name, value: el.name });
                } else if (el.type === 'private') {
                    certsPrivateOptions.push({ label: el.name, value: el.name });
                } else if (el.type === 'chained') {
                    certsChainOptions.push({ label: el.name, value: el.name });
                } else {
                    certsPublicOptions.push({ label: el.name, value: el.name });
                    certsPrivateOptions.push({ label: el.name, value: el.name });
                    certsChainOptions.push({ label: el.name, value: el.name });
                }
            });

        certsPublicOptions.unshift({ label: I18n.t(ConfigGeneric.NONE_LABEL), value: ConfigGeneric.NONE_VALUE });
        certsPrivateOptions.unshift({ label: I18n.t(ConfigGeneric.NONE_LABEL), value: ConfigGeneric.NONE_VALUE });
        certsChainOptions.unshift({ label: I18n.t(ConfigGeneric.NONE_LABEL), value: ConfigGeneric.NONE_VALUE });

        this.setState({
            certsPublicOptions,
            certsChainOptions,
            certsPrivateOptions,
            collectionsOptions,
        });
    }

    renderItem(error, disabled /* , defaultValue */) {
        if (!this.state.certsPublicOptions || !this.state.certsPrivateOptions || !this.state.certsChainOptions) {
            return null;
        }
        const leCollection = (ConfigGeneric.getValue(this.props.data, this.props.schema.leCollectionName || 'leCollection') || 'false').toString();
        const certPublic = ConfigGeneric.getValue(this.props.data, this.props.schema.certPublicName || 'certPublic');
        const certPrivate = ConfigGeneric.getValue(this.props.data, this.props.schema.certPrivateName || 'certPrivate');
        const certChained = ConfigGeneric.getValue(this.props.data, this.props.schema.certChainedName || 'certChained');

        const itemCertPublic = this.state.certsPublicOptions?.find(item => item.value === certPublic);
        const itemCertPrivate = this.state.certsPrivateOptions?.find(item => item.value === certPrivate);
        const itemCertChained = this.state.certsChainOptions?.find(item => item.value === certChained);

        return <div className={this.props.classes.fullWidth}>
            {this.state.collectionsOptions ? <FormControl className={this.props.classes.leWidth} variant="standard">
                <InputLabel shrink>Let&apos;s encrypt</InputLabel>
                <Select
                    variant="standard"
                    error={!!error}
                    displayEmpty
                    disabled={!!disabled}
                    value={leCollection}
                    onChange={e => this.onChange(
                        this.props.schema.leCollectionName || 'leCollection',
                        e.target.value === 'false' ? false : (e.target.value === 'true' ? true : e.target.value),
                    )}
                >
                    <MenuItem
                        key="_false"
                        value="false"
                        style={{ fontWeight: 'bold' }}
                    >
                        {I18n.t('ra_Do not use let\'s encrypt')}
                    </MenuItem>
                    <MenuItem
                        key="_true"
                        value="true"
                        style={{ fontWeight: 'bold' }}
                    >
                        {I18n.t('ra_Use all available let\'s encrypt certificates')}
                    </MenuItem>
                    {this.state.collectionsOptions?.map(item =>
                        <MenuItem
                            key={item}
                            value={item}
                        >
                            {item}
                        </MenuItem>)}
                </Select>
            </FormControl> : null}
            {this.state.collectionsOptions ? <br /> : null}
            {this.state.collectionsOptions && leCollection !== 'false' ? <div>{I18n.t('ra_Fallback custom certificates')}</div> : null}
            <FormControl className={this.props.classes.certWidth} variant="standard">
                <InputLabel shrink>{I18n.t('ra_Public certificate')}</InputLabel>
                <Select
                    variant="standard"
                    error={!!error}
                    displayEmpty
                    disabled={!!disabled}
                    value={certPublic || ''}
                    renderValue={() => this.getText(itemCertPublic?.label)}
                    onChange={e => this.onChange(this.props.schema.certPublicName || 'certPublic', e.target.value)}
                >
                    {this.state.certsPublicOptions?.map((item, i) =>
                        <MenuItem
                            key={`${item.value}_${i}`}
                            value={item.value}
                            style={item.value === ConfigGeneric.NONE_VALUE ? { opacity: 0.5 } : {}}
                        >
                            {this.getText(item.label)}
                        </MenuItem>)}
                </Select>
            </FormControl>
            <FormControl className={this.props.classes.certWidth} variant="standard">
                <InputLabel shrink>{I18n.t('ra_Private certificate')}</InputLabel>
                <Select
                    variant="standard"
                    error={!!error}
                    displayEmpty
                    disabled={!!disabled}
                    value={certPrivate || ''}
                    renderValue={() => this.getText(itemCertPrivate?.label)}
                    onChange={e => this.onChange(this.props.schema.certPrivateName || 'certPrivate', e.target.value)}
                >
                    {this.state.certsPrivateOptions?.map((item, i) =>
                        <MenuItem
                            key={`${item.value}_${i}`}
                            value={item.value}
                            style={item.value === ConfigGeneric.NONE_VALUE ? { opacity: 0.5 } : {}}
                        >
                            {this.getText(item.label)}
                        </MenuItem>)}
                </Select>
            </FormControl>
            <FormControl className={this.props.classes.certWidth} variant="standard">
                <InputLabel shrink>{I18n.t('ra_Chained certificate')}</InputLabel>
                <Select
                    variant="standard"
                    error={!!error}
                    displayEmpty
                    disabled={!!disabled}
                    value={certChained || ''}
                    renderValue={() => this.getText(itemCertChained?.label)}
                    onChange={e => this.onChange(this.props.schema.certChainedName || 'certChained', e.target.value)}
                >
                    {this.state.certsChainOptions?.map((item, i) =>
                        <MenuItem
                            key={`${item.value}_${i}`}
                            value={item.value}
                            style={item.value === ConfigGeneric.NONE_VALUE ? { opacity: 0.5 } : {}}
                        >
                            {this.getText(item.label)}
                        </MenuItem>)}
                </Select>
            </FormControl>
        </div>;
    }
}

ConfigCertificates.propTypes = {
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

export default withStyles(styles)(ConfigCertificates);
