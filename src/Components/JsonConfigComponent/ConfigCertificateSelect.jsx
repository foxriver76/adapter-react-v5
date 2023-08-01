import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import {
    InputLabel,
    MenuItem,
    FormControl,
    Select,
    FormHelperText,
} from '@mui/material';

import ConfigGeneric from './ConfigGeneric';
import I18n from './wrapper/i18n';

const styles = () => ({
    fullWidth: {
        width: '100%',
    },
});

class ConfigCertificateSelect extends ConfigGeneric {
    async componentDidMount() {
        super.componentDidMount();
        const value = ConfigGeneric.getValue(this.props.data, this.props.attr);
        let selectOptions = await this.props.socket.getCertificates();

        selectOptions = selectOptions
            .filter(el => {
                const name = this.props.attr.toLowerCase();

                if (name.includes(el.type)) {
                    return true;
                }
                if (el.type === 'public' && name.includes('cert')) {
                    return true;
                }
                if (el.type === 'private' && (name.includes('priv') || name.includes('key'))) {
                    return true;
                }
                return !!(el.type === 'chained' && (name.includes('chain') || name.includes('ca')));
            })
            .map(el => ({ label: el.name, value: el.name }));

        selectOptions.unshift({ label: I18n.t(ConfigGeneric.NONE_LABEL), value: ConfigGeneric.NONE_VALUE });

        this.setState({ value, selectOptions });
    }

    renderItem(error, disabled /* , defaultValue */) {
        if (!this.state.selectOptions) {
            return null;
        }
        // eslint-disable-next-line
        const item = this.state.selectOptions?.find(item => item.value === this.state.value);

        return <FormControl className={this.props.classes.fullWidth} variant="standard">
            {this.props.schema.label ? <InputLabel shrink>{this.getText(this.props.schema.label)}</InputLabel> : null}
            <Select
                variant="standard"
                error={!!error}
                displayEmpty
                disabled={!!disabled}
                value={this.state.value}
                renderValue={() => this.getText(item?.label, this.props.schema.noTranslation !== false)}
                onChange={e =>
                    this.setState({ value: e.target.value }, () =>
                        this.onChange(this.props.attr, this.state.value))}
            >
                {this.state.selectOptions?.map(item_ =>
                    <MenuItem
                        key={item_.value}
                        value={item_.value}
                        style={item_.value === ConfigGeneric.NONE_VALUE ? { opacity: 0.5 } : {}}
                    >
                        {
                            this.getText(item_.label, this.props.schema.noTranslation !== false)
                        }
                    </MenuItem>)}
            </Select>
            {this.props.schema.help ? <FormHelperText>{this.renderHelp(this.props.schema.help, this.props.schema.helpLink, this.props.schema.noTranslation)}</FormHelperText> : null}
        </FormControl>;
    }
}

ConfigCertificateSelect.propTypes = {
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

export default withStyles(styles)(ConfigCertificateSelect);
