import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormHelperText from '@mui/material/FormHelperText';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';

import I18n from './wrapper/i18n';
import Utils from './wrapper/Components/Utils';

import ConfigGeneric from './ConfigGeneric';

const styles = () => ({
    fullWidth: {
        width: '100%'
    },
    noMargin: {
        '&>div': {
            marginTop: 0,
        },
    }
});

class ConfigSelect extends ConfigGeneric {
    componentDidMount() {
        super.componentDidMount();
        const value = ConfigGeneric.getValue(this.props.data, this.props.attr);

        const selectOptions = JSON.parse(JSON.stringify(this.props.schema.options));

        // if __different
        if (Array.isArray(value)) {
            this.initialValue = [...value];
            selectOptions.unshift({label: I18n.t(ConfigGeneric.DIFFERENT_LABEL), value: ConfigGeneric.DIFFERENT_VALUE});
            this.setState({value: ConfigGeneric.DIFFERENT_VALUE, selectOptions});
        } else {
            this.setState({value, selectOptions});
        }
    }

    renderItem(error, disabled, defaultValue) {
        if (!this.state.selectOptions) {
            return null;
        }

        const selectOptions = (this.state.selectOptions || []).filter(item => {
            if (!item.hidden) {
                return true;
            } else if (this.props.custom) {
                return !this.executeCustom(item.hidden, this.props.data, this.props.customObj, this.props.instanceObj, this.props.arrayIndex, this.props.globalData);
            } else {
                return !this.execute(item.hidden, this.props.schema.default, this.props.data, this.props.arrayIndex, this.props.globalData);
            }
        });

        // eslint-disable-next-line
        const item = selectOptions.find(item => item.value == this.state.value); // let "==" be and not ===

        return <FormControl
            variant="standard"
            className={Utils.clsx(this.props.classes.fullWidth, this.props.arrayIndex !== undefined && this.props.classes.noMargin)}
            id={`jsonSelect_${this.props.schema.attr}_${this.props.index || this.props.index === 0 ? this.props.index : ''}`}
        >
            {this.props.schema.label ? <InputLabel>{this.getText(this.props.schema.label)}</InputLabel> : null}
            <Select
                variant="standard"
                error={!!error}
                disabled={!!disabled}
                value={this.state.value || '_'}
                renderValue={val => this.getText(item?.label, this.props.schema.noTranslation)}
                onChange={e => {
                    this.setState({ value: e.target.value === '_' ? '' : e.target.value }, () => {
                        if (this.state.value === ConfigGeneric.DIFFERENT_VALUE) {
                            this.onChange(this.props.attr, this.initialValue);
                        } else {
                            this.onChange(this.props.attr, this.state.value);
                        }
                    });
                }}
            >
                {selectOptions.map(item =>
                    <MenuItem key={item.value} value={item.value} style={item.value === ConfigGeneric.DIFFERENT_VALUE ? {opacity: 0.5} : {}}>{this.getText(item.label, this.props.schema.noTranslation)}</MenuItem>)}
            </Select>
            {this.props.schema.help ? <FormHelperText>{this.renderHelp(this.props.schema.help, this.props.schema.helpLink, this.props.schema.noTranslation)}</FormHelperText> : null}
        </FormControl>;
    }
}

ConfigSelect.propTypes = {
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

export default withStyles(styles)(ConfigSelect);