import React, { Component } from 'react';
import PropTypes from 'prop-types';

import { Grid, Button } from '@mui/material';

import IconInfo from '@mui/icons-material/Info';
import IconWarning from '@mui/icons-material/Warning';
import IconError from '@mui/icons-material/Error';

import I18n from './wrapper/i18n';
import Utils from './wrapper/Components/Utils';
import ConfirmDialog from './wrapper/Dialogs/Confirm';

class ConfigGeneric extends Component {
    static DIFFERENT_VALUE = '__different__';

    static DIFFERENT_LABEL = 'ra___different__';

    static NONE_VALUE = '';

    static NONE_LABEL = 'ra_none';

    static AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

    constructor(props) {
        super(props);

        this.state = {
            confirmDialog: false,
            confirmNewValue: null,
            confirmAttr: null,
            confirmData: null,
        };

        this.isError = {};

        if (props.schema) {
            if (props.custom) {
                this.defaultValue = props.schema.defaultFunc
                    ? this.executeCustom(
                        props.schema.defaultFunc,
                        props.schema.default,
                        props.data,
                        props.instanceObj,
                        props.arrayIndex,
                        props.globalData,
                    )
                    : props.schema.default;
            } else {
                this.defaultValue = props.schema.defaultFunc
                    ? this.execute(
                        props.schema.defaultFunc,
                        props.schema.default,
                        props.data,
                        props.arrayIndex,
                        props.globalData,
                    )
                    : props.schema.default;
            }
        }

        this.lang = I18n.getLanguage();
    }

    componentDidMount() {
        this.props.registerOnForceUpdate && this.props.registerOnForceUpdate(this.props.attr, this.onUpdate);
        const LIKE_SELECT = ['select', 'autocomplete', 'autocompleteSendTo'];
        // init default value
        if (this.defaultValue !== undefined) {
            const value = ConfigGeneric.getValue(this.props.data, this.props.attr);
            if (
                value === undefined ||
                (LIKE_SELECT.includes(this.props.schema.type) && (value === '' || value === null))
            ) {
                setTimeout(() => {
                    if (this.props.custom) {
                        this.props.onChange(this.props.attr, this.defaultValue, () =>
                            setTimeout(() => this.props.forceUpdate([this.props.attr], this.props.data), 100));
                        // this.onChange(this.props.attr, this.defaultValue);
                    } else {
                        ConfigGeneric.setValue(this.props.data, this.props.attr, this.defaultValue);
                        this.props.onChange(this.props.data, undefined, () =>
                            this.props.forceUpdate([this.props.attr], this.props.data));
                    }
                }, 100);
            }
        } else if (this.props.schema.defaultSendTo) {
            this.sendTo();
        }
    }

    sendTo() {
        if (this.props.alive) {
            this.defaultSendToDone = true;
            let data = this.props.schema.data;
            if (data === undefined && this.props.schema.jsonData) {
                data = this.getPattern(this.props.schema.jsonData);
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    console.error(`Cannot parse json data: ${data}`);
                }
            } else {
                data = {
                    attr: this.props.attr,
                    value: ConfigGeneric.getValue(this.props.data, this.props.attr),
                };
            }

            if (data === undefined) {
                data = null;
            }

            this.props.socket
                .sendTo(`${this.props.adapterName}.${this.props.instance}`, this.props.schema.defaultSendTo, data)
                .then(value => {
                    if (value !== null && value !== undefined) {
                        if (this.props.custom) {
                            this.props.onChange(this.props.attr, value, () =>
                                this.props.forceUpdate([this.props.attr], this.props.data));
                            // this.onChange(this.props.attr, this.defaultValue);
                        } else {
                            ConfigGeneric.setValue(this.props.data, this.props.attr, value);
                            this.props.onChange(this.props.data, undefined, () =>
                                this.props.forceUpdate([this.props.attr], this.props.data));
                        }
                    }
                });
        } else {
            this.defaultSendToDone = false;
            // show error, that instance does not started
            this.onError(this.props.attr, I18n.t('ra_Instance %s is not alive', this.props.instance));
        }
    }

    componentWillUnmount() {
        this.props.registerOnForceUpdate && this.props.registerOnForceUpdate(this.props.attr);
        if (this.sendToTimeout) {
            clearTimeout(this.sendToTimeout);
            this.sendToTimeout = null;
        }
    }

    onUpdate = data => {
        const value = ConfigGeneric.getValue(data || this.props.data, this.props.attr) || '';
        if (this.state.value !== value) {
            this.setState({ value });
        } else {
            this.forceUpdate();
        }
    };

    /**
     * Extract attribute out of data
     *
     * @param {Record<string, any>} data
     * @param {string|string[]} attr
     * @return {*|null}
     */
    static getValue(data, attr) {
        if (typeof attr === 'string') {
            return ConfigGeneric.getValue(data, attr.split('.'));
        }
        if (attr.length === 1) {
            return data[attr[0]];
        }
        const part = attr.shift();
        if (typeof data[part] === 'object') {
            return ConfigGeneric.getValue(data[part], attr);
        }
        return null;
    }

    static setValue(data, attr, value) {
        if (typeof attr === 'string') {
            ConfigGeneric.setValue(data, attr.split('.'), value);
            return;
        }
        if (attr.length === 1) {
            if (value === null) {
                delete data[attr[0]];
            } else {
                data[attr[0]] = value;
            }
        } else {
            const part = attr.shift();
            if (!data[part] || typeof data[part] === 'object') {
                data[part] = data[part] || {};
            }
            ConfigGeneric.setValue(data[part], attr, value);
        }
    }

    getText(text, noTranslation) {
        if (!text) {
            return '';
        }

        if (typeof text === 'string') {
            text = noTranslation ? text : I18n.t(text);
            if (text.includes('${')) {
                return this.getPattern(text);
            }
            return text;
        }
        if (text && typeof text === 'object') {
            if (text.func) {
                // calculate pattern
                if (typeof text.func === 'object') {
                    return this.getPattern(text.func[this.lang] || text.func.en || '');
                }
                return this.getPattern(text.func);
            }

            return text[this.lang] || text.en || '';
        }

        return text.toString();
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

        return (
            <ConfirmDialog
                title={this.getText(confirm.title) || I18n.t('ra_Please confirm')}
                text={this.getText(confirm.text)}
                ok={this.getText(confirm.ok) || I18n.t('ra_Ok')}
                cancel={this.getText(confirm.cancel) || I18n.t('ra_Cancel')}
                icon={icon}
                onClose={isOk =>
                    this.setState({ confirmDialog: false }, () => {
                        if (isOk) {
                            const data = JSON.parse(JSON.stringify(this.props.data));
                            if (this.state.confirmDepAttr) {
                                ConfigGeneric.setValue(data, this.state.confirmDepAttr, this.state.confirmDepNewValue);
                            }

                            ConfigGeneric.setValue(data, this.state.confirmAttr, this.state.confirmNewValue);
                            this.setState(
                                {
                                    confirmDialog: false,
                                    confirmDepAttr: null,
                                    confirmDepNewValue: null,
                                    confirmNewValue: null,
                                    confirmAttr: null,
                                    // eslint-disable-next-line react/no-unused-state
                                    confirmOldValue: null,
                                    confirmData: null,
                                },
                                () => this.props.onChange(data),
                            );
                        } else {
                            this.setState({
                                confirmDialog: false,
                                confirmDepAttr: null,
                                confirmDepNewValue: null,
                                confirmNewValue: null,
                                confirmAttr: null,
                                // eslint-disable-next-line react/no-unused-state
                                confirmOldValue: null,
                                confirmData: null,
                            });
                        }
                    })}
            />
        );
    }

    /**
     * Trigger onChange, to activate save button on change
     *
     * @param attr the changed attribute
     * @param newValue new value of the attribute
     * @param {(() => void)?} cb optional callback function, else returns a Promise
     * @return {Promise<void>}
     */
    // eslint-disable-next-line react/no-unused-class-component-methods
    onChange(attr, newValue, cb) {
        const data = JSON.parse(JSON.stringify(this.props.data));
        ConfigGeneric.setValue(data, attr, newValue);

        if (
            this.props.schema.confirm &&
            this.execute(this.props.schema.confirm.condition, false, data, this.props.arrayIndex, this.props.globalData)
        ) {
            return new Promise(resolve => {
                this.setState(
                    {
                        confirmDialog: true,
                        confirmNewValue: newValue,
                        confirmAttr: attr,
                        confirmData: null,
                    },
                    () => {
                        if (typeof cb === 'function') {
                            cb();
                        } else {
                            resolve();
                        }
                    },
                );
            });
        }
        // find any inputs with confirmation
        if (this.props.schema.confirmDependsOn) {
            for (let z = 0; z < this.props.schema.confirmDependsOn.length; z++) {
                const dep = this.props.schema.confirmDependsOn[z];
                if (dep.confirm) {
                    const val = ConfigGeneric.getValue(data, dep.attr);

                    if (
                        this.execute(
                            dep.confirm.condition,
                            false,
                            data,
                            this.props.arrayIndex,
                            this.props.globalData,
                        )
                    ) {
                        return new Promise(resolve => {
                            this.setState(
                                {
                                    confirmDialog: true,
                                    confirmNewValue: newValue,
                                    confirmAttr: attr,
                                    confirmDepNewValue: val,
                                    confirmDepAttr: dep.attr,
                                    confirmData: dep.confirm,
                                },
                                () => {
                                    if (typeof cb === 'function') {
                                        cb();
                                    } else {
                                        resolve();
                                    }
                                },
                            );
                        });
                    }
                }
            }
        }

        const changed = [];
        if (this.props.schema.onChangeDependsOn) {
            for (let z = 0; z < this.props.schema.onChangeDependsOn.length; z++) {
                const dep = this.props.schema.onChangeDependsOn[z];
                if (dep.onChange) {
                    const val = ConfigGeneric.getValue(data, dep.attr);

                    let _newValue;
                    if (this.props.custom) {
                        _newValue = this.executeCustom(
                            dep.onChange.calculateFunc,
                            data,
                            this.props.customObj,
                            this.props.instanceObj,
                            this.props.arrayIndex,
                            this.props.globalData,
                        );
                    } else {
                        _newValue = this.execute(
                            dep.onChange.calculateFunc,
                            val,
                            data,
                            this.props.arrayIndex,
                            this.props.globalData,
                        );
                    }

                    if (_newValue !== val) {
                        ConfigGeneric.setValue(data, dep.attr, _newValue);
                        changed.push(dep.attr);
                    }
                }
            }
        }

        if (this.props.schema.hiddenDependsOn) {
            for (let z = 0; z < this.props.schema.hiddenDependsOn.length; z++) {
                const dep = this.props.schema.hiddenDependsOn[z];
                dep.hidden && changed.push(dep.attr);
            }
        }

        if (this.props.schema.labelDependsOn) {
            for (let z = 0; z < this.props.schema.labelDependsOn.length; z++) {
                const dep = this.props.schema.labelDependsOn[z];
                dep.hidden && changed.push(dep.attr);
            }
        }

        if (this.props.schema.helpDependsOn) {
            for (let z = 0; z < this.props.schema.helpDependsOn.length; z++) {
                const dep = this.props.schema.helpDependsOn[z];
                dep.hidden && changed.push(dep.attr);
            }
        }

        if (this.props.schema.onChange && !this.props.schema.onChange.ignoreOwnChanges) {
            const val = ConfigGeneric.getValue(data, this.props.attr);

            const newValue_ = this.props.custom
                ? this.executeCustom(
                    this.props.schema.onChange.calculateFunc,
                    data,
                    this.props.customObj,
                    this.props.instanceObj,
                    this.props.arrayIndex,
                    this.props.globalData,
                )
                : this.execute(
                    this.props.schema.onChange.calculateFunc,
                    val,
                    data,
                    this.props.arrayIndex,
                    this.props.globalData,
                );
            if (newValue_ !== val) {
                ConfigGeneric.setValue(data, this.props.attr, newValue_);
            }
        }

        if (this.props.custom) {
            this.props.onChange(attr, newValue, () => cb && cb());

            changed &&
                    changed.length &&
                    changed.forEach((_attr, i) =>
                        setTimeout(() => this.props.onChange(_attr, ConfigGeneric.getValue(data, _attr)), i * 50));
        } else {
            this.props.onChange(data, undefined, () => {
                changed.length && this.props.forceUpdate(changed, data);
                cb && cb();
            });
        }

        return Promise.resolve();
    }

    execute(func, defaultValue, data, arrayIndex, globalData) {
        if (func && typeof func === 'object') {
            func = func.func;
        }

        if (!func) {
            return defaultValue;
        }
        try {
            // eslint-disable-next-line no-new-func
            const f = new Function(
                'data',
                'originalData',
                '_system',
                '_alive',
                '_common',
                '_socket',
                '_instance',
                'arrayIndex',
                'globalData',
                '_changed',
                func.includes('return') ? func : `return ${func}`,
            );
            return f(
                data || this.props.data,
                this.props.originalData,
                this.props.systemConfig,
                this.props.alive,
                this.props.common,
                this.props.socket,
                this.props.instance,
                arrayIndex,
                globalData,
                this.props.changed,
            );
        } catch (e) {
            console.error(`Cannot execute ${func}: ${e}`);
            return defaultValue;
        }
    }

    executeCustom(func, data, customObj, instanceObj, arrayIndex, globalData) {
        if (func && typeof func === 'object') {
            func = func.func;
        }

        if (!func) {
            return null;
        }
        try {
            // eslint-disable-next-line no-new-func
            const f = new Function(
                'data',
                'originalData',
                '_system',
                'instanceObj',
                'customObj',
                '_socket',
                'arrayIndex',
                'globalData',
                '_changed',
                func.includes('return') ? func : `return ${func}`,
            );
            return f(
                data || this.props.data,
                this.props.originalData,
                this.props.systemConfig,
                instanceObj,
                customObj,
                this.props.socket,
                arrayIndex,
                globalData,
                this.props.changed,
            );
        } catch (e) {
            console.error(`Cannot execute ${func}: ${e}`);
            return null;
        }
    }

    calculate(schema) {
        let error;
        let disabled;
        let hidden;
        let defaultValue;

        if (this.props.custom) {
            error = schema.validator
                ? !this.executeCustom(
                    schema.validator,
                    this.props.data,
                    this.props.customObj,
                    this.props.instanceObj,
                    this.props.arrayIndex,
                    this.props.globalData,
                )
                : false;
            disabled = schema.disabled
                ? this.executeCustom(
                    schema.disabled,
                    this.props.data,
                    this.props.customObj,
                    this.props.instanceObj,
                    this.props.arrayIndex,
                    this.props.globalData,
                )
                : false;
            hidden = schema.hidden
                ? this.executeCustom(
                    schema.hidden,
                    this.props.data,
                    this.props.customObj,
                    this.props.instanceObj,
                    this.props.arrayIndex,
                    this.props.globalData,
                )
                : false;
            defaultValue = schema.defaultFunc
                ? this.executeCustom(
                    schema.defaultFunc,
                    this.props.data,
                    this.props.customObj,
                    this.props.instanceObj,
                    this.props.arrayIndex,
                    this.props.globalData,
                )
                : schema.default;
        } else {
            error = schema.validator
                ? !this.execute(schema.validator, false, this.props.data, this.props.arrayIndex, this.props.globalData)
                : false;
            disabled = schema.disabled
                ? this.execute(schema.disabled, false, this.props.data, this.props.arrayIndex, this.props.globalData)
                : false;
            hidden = schema.hidden
                ? this.execute(schema.hidden, false, this.props.data, this.props.arrayIndex, this.props.globalData)
                : false;
            defaultValue = schema.defaultFunc
                ? this.execute(
                    schema.defaultFunc,
                    schema.default,
                    this.props.data,
                    this.props.arrayIndex,
                    this.props.globalData,
                )
                : schema.default;
        }

        return {
            error, disabled, hidden, defaultValue,
        };
    }

    onError(attr, error) {
        if (!error) {
            delete this.isError[attr];
        } else {
            this.isError[attr] = error;
        }

        this.props.onError && this.props.onError(attr, error);
    }

    renderItem(/* error, disabled, defaultValue */) {
        return this.getText(this.props.schema.label) || this.getText(this.props.schema.text);
    }

    // eslint-disable-next-line react/no-unused-class-component-methods
    renderHelp(text, link, noTranslation) {
        if (!link) {
            text = this.getText(text, noTranslation) || '';
            if (
                text &&
                (text.includes('<a ') || text.includes('<br') || text.includes('<b>') || text.includes('<i>'))
            ) {
                return Utils.renderTextWithA(text);
            }
            return text;
        }
        return <a
            href={link}
            target="_blank"
            rel="noreferrer"
            style={{
                color: this.props.themeType === 'dark' ? '#a147ff' : '#5b238f',
                textDecoration: 'underline',
            }}
        >
            {this.getText(text, noTranslation)}
        </a>;
    }

    getPattern(pattern, data) {
        data = data || this.props.data;
        if (!pattern) {
            return '';
        }
        if (typeof pattern === 'object') {
            if (pattern.func) {
                pattern = pattern.func;
            } else {
                console.log(`Object must be stringified: ${JSON.stringify(pattern)}`);
                pattern = JSON.stringify(pattern);
            }
        }

        try {
            if (this.props.custom) {
                // eslint-disable-next-line no-new-func
                const f = new Function(
                    'data',
                    'originalData',
                    'arrayIndex',
                    'globalData',
                    '_system',
                    'instanceObj',
                    'customObj',
                    '_socket',
                    '_changed',
                    `return \`${pattern.replace(/`/g, '\\`')}\``,
                );
                return f(
                    data,
                    this.props.originalData,
                    this.props.arrayIndex,
                    this.props.globalData,
                    this.props.systemConfig,
                    this.props.instanceObj,
                    this.props.customObj,
                    this.props.socket,
                    this.props.changed,
                );
            }
            // eslint-disable-next-line no-new-func
            const f = new Function(
                'data',
                'originalData',
                'arrayIndex',
                'globalData',
                '_system',
                '_alive',
                '_common',
                '_socket',
                '_changed',
                `return \`${pattern.replace(/`/g, '\\`')}\``,
            );
            return f(
                data,
                this.props.originalData,
                this.props.arrayIndex,
                this.props.globalData,
                this.props.systemConfig,
                this.props.alive,
                this.props.common,
                this.props.socket,
                this.props.changed,
            );
        } catch (e) {
            console.error(`Cannot execute ${pattern}: ${e}`);
            return pattern;
        }
    }

    render() {
        const schema = this.props.schema;

        if (!schema) {
            return null;
        }

        if (this.props.alive && this.defaultSendToDone === false) {
            this.sendToTimeout = setTimeout(() => {
                this.sendToTimeout = null;
                this.sendTo();
            }, 200);
        }

        const {
            error, disabled, hidden, defaultValue,
        } = this.calculate(schema);

        if (hidden) {
            // Remove all errors if element is hidden
            if (Object.keys(this.isError).length) {
                setTimeout(
                    isError => Object.keys(isError).forEach(attr => this.props.onError(attr)),
                    100,
                    JSON.parse(JSON.stringify(this.isError)),
                );
                this.isError = {};
            }

            if (schema.hideOnlyControl) {
                const item = <Grid
                    item
                    xs={schema.xs || undefined}
                    lg={schema.lg || undefined}
                    md={schema.md || undefined}
                    sm={schema.sm || undefined}
                    style={({
                        marginBottom: 0, /* marginRight: 8, */
                        textAlign: 'left',
                        ...schema.style,
                        ...(this.props.themeType === 'dark' ? schema.darkStyle : {}),
                    })}
                />;

                if (schema.newLine) {
                    return <>
                        <div style={{ flexBasis: '100%', height: 0 }} />
                        {item}
                    </>;
                }
                return item;
            }
            return null;
        }
        // Add error
        if (schema.validatorNoSaveOnError) {
            if (error && !Object.keys(this.isError).length) {
                this.isError = {
                    [this.props.attr]: schema.validatorErrorText ? I18n.t(schema.validatorErrorText) : true,
                };
                setTimeout(
                    isError => Object.keys(isError).forEach(attr => this.props.onError(attr, isError[attr])),
                    100,
                    JSON.parse(JSON.stringify(this.isError)),
                );
            } else if (!error && Object.keys(this.isError).length) {
                setTimeout(
                    isError => Object.keys(isError).forEach(attr => this.props.onError(attr)),
                    100,
                    JSON.parse(JSON.stringify(this.isError)),
                );
                this.isError = {};
            }
        }

        const renderedItem = this.renderItem(
            error,
            disabled || this.props.commandRunning || this.props.disabled,
            defaultValue,
        );

        if (this.noPlaceRequired) {
            return renderedItem;
        }

        const item = <Grid
            item
            title={this.getText(schema.tooltip)}
            xs={schema.xs || undefined}
            lg={schema.lg || undefined}
            md={schema.md || undefined}
            sm={schema.sm || undefined}
            style={({
                marginBottom: 0,
                // marginRight: 8,
                textAlign: 'left',
                width:
                            schema.type === 'divider' || schema.type === 'header'
                                ? schema.width || '100%'
                                : undefined,
                ...schema.style,
                ...(this.props.themeType === 'dark' ? schema.darkStyle : {}),
            })}
        >
            {this.props.schema.defaultSendTo && this.props.schema.button ?
                <Grid container style={{ width: '100%' }}>
                    <Grid item flex={1}>
                        {renderedItem}
                    </Grid>
                    <Grid item>
                        <Button
                            variant="outlined"
                            onClick={() => this.sendTo()}
                            title={
                                this.props.schema.buttonTooltip
                                    ? this.getText(
                                        this.props.schema.buttonTooltip,
                                        this.props.schema.buttonTooltipNoTranslation,
                                    )
                                    : I18n.t('ra_Request data by instance')
                            }
                        >
                            {this.getText(this.props.schema.button)}
                        </Button>
                    </Grid>
                </Grid> : renderedItem}
        </Grid>;

        if (schema.newLine) {
            return <>
                <div style={{ flexBasis: '100%', height: 0 }} />
                {this.renderConfirmDialog()}
                {item}
            </>;
        }
        if (this.state.confirmDialog) {
            return <>
                {this.renderConfirmDialog()}
                {item}
            </>;
        }
        return item;
    }
}

ConfigGeneric.propTypes = {
    socket: PropTypes.object.isRequired,
    data: PropTypes.object,
    originalData: PropTypes.object,
    schema: PropTypes.object,
    attr: PropTypes.string,
    // eslint-disable-next-line react/no-unused-prop-types
    value: PropTypes.any,
    // eslint-disable-next-line react/no-unused-prop-types
    themeName: PropTypes.string,
    style: PropTypes.object,
    onError: PropTypes.func,
    onChange: PropTypes.func,
    // eslint-disable-next-line react/no-unused-prop-types
    customs: PropTypes.object,
    forceUpdate: PropTypes.func.isRequired,
    disabled: PropTypes.bool,

    systemConfig: PropTypes.object,
    alive: PropTypes.bool,
    changed: PropTypes.bool,
    common: PropTypes.object,
    adapterName: PropTypes.string,
    instance: PropTypes.number,
    // eslint-disable-next-line react/no-unused-prop-types
    dateFormat: PropTypes.string,
    // eslint-disable-next-line react/no-unused-prop-types
    isFloatComma: PropTypes.bool,

    customObj: PropTypes.object,
    instanceObj: PropTypes.object,
    custom: PropTypes.bool,
};

export default ConfigGeneric;
