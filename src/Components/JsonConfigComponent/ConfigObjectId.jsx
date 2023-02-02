import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import { Button, TextField } from '@mui/material';

import DialogSelectID from './wrapper/Dialogs/SelectID';

import ConfigGeneric from './ConfigGeneric';

const styles = theme => ({
    fullWidth: {
        width: '100%'
    },
    flex: {
        display: 'flex'
    },
    button: {
        height: 48,
        marginLeft: 4,
        minWidth: 48,
    }
});

class ConfigObjectId extends ConfigGeneric {
    async componentDidMount() {
        super.componentDidMount();
        const { data, attr } = this.props;
        const value = ConfigGeneric.getValue(data, attr) || '';
        this.setState({ value, initialized: true});
    }

    renderItem(error, disabled, defaultValue) {
        if (!this.state.initialized) {
            return null;
        }
        const { classes, schema, socket, attr } = this.props;
        const { value, showSelectId } = this.state;

        return <FormControl className={classes.fullWidth} variant="standard">
            {schema.label ? <InputLabel shrink>{this.getText(schema.label)}</InputLabel> : null}
            <div className={classes.flex}>
                <TextField
                    variant="standard"
                    fullWidth
                    value={value}
                    error={!!error}
                    disabled={disabled}
                    placeholder={this.getText(schema.placeholder)}
                    label={this.getText(schema.label)}
                    helperText={this.renderHelp(schema.help, schema.helpLink, schema.noTranslation)}
                    onChange={e => {
                        const value = e.target.value;
                        this.setState({ value }, () =>
                            this.onChange(attr, value))
                    }}
                />
                <Button
                    color="grey"
                    className={this.props.classes.button}
                    size="small"
                    variant="outlined"
                    onClick={() => this.setState({ showSelectId: true })}
                >...</Button>
            </div>
            {showSelectId ? <DialogSelectID
                imagePrefix={this.props.imagePrefix === undefined ? '../..' : this.props.imagePrefix}
                dateFormat={this.props.dateFormat}
                isFloatComma={this.props.isFloatComma}
                dialogName={'admin.' + this.props.adapterName}
                themeType={this.props.themeType}
                socket={socket}
                statesOnly={schema.all === undefined ? true : schema.all}
                selected={value}
                onClose={() => this.setState({ showSelectId: false })}
                onOk={value =>
                    this.setState({ showSelectId: false, value }, () =>
                        this.onChange(attr, value))}
            /> : null}
        </FormControl>;
    }
}

ConfigObjectId.propTypes = {
    socket: PropTypes.object.isRequired,
    themeType: PropTypes.string,
    themeName: PropTypes.string,
    style: PropTypes.object,
    className: PropTypes.string,
    data: PropTypes.object.isRequired,
    schema: PropTypes.object,
    onError: PropTypes.func,
    onChange: PropTypes.func,
    dateFormat: PropTypes.string,
    isFloatComma: PropTypes.bool,
    imagePrefix: PropTypes.string,
};

export default withStyles(styles)(ConfigObjectId);