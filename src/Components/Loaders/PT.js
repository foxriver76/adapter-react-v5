/**
 * Copyright 2021-2023 ioBroker GmbH
 *
 * MIT License
 *
 **/
import React from 'react';
import PropTypes from 'prop-types';
// import './PT.css'
const ptStyles = `
.logo-background-light, .logo-background-colored {
    background: white;
}
.logo-background-dark, .logo-background-blue {
    background: black;
}
.pt-logo-div {
    position: absolute;
    top: 50%;
    left: 50%;
    -ms-transform: translateX(-50%) translateY(-50%);
    -webkit-transform: translate(-50%,-50%);
    transform: translate(-50%,-50%);
    z-index: 2;
}
.pt-logo-border {
    border-style: solid;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    position: absolute;
}
.pt-loader-block {
    height: 65px;
    width: 74px;
    border-radius: 15px;
    position: absolute;
    box-sizing: content-box;
}
.pt-loader-blue {
    border: 9px solid #0F99DE;
    transform: rotate(5grad);
    left: 93px;
    top: 0;
    animation: spin-blue 5s ease-in-out infinite;
}
.pt-loader-green {
    border: 9px solid #88A536;
    transform: rotate(-6grad);
    left: 70px;
    top: 58px;
    animation: spin-green 5s ease-in-out infinite;
}
.pt-loader-red {
    border: 9px solid #BD1B24;
    transform: rotate(-15grad);
    left: 24px;
    top: 100px;
    animation: spin-red 5s ease-in-out infinite;
}

@keyframes spin-blue {
    0% {
        transform: rotate(5deg);
    }
    25% {
        transform: rotate(185deg);
    }
    50% {
        transform: rotate(185deg);
    }
    75% {
        transform: rotate(185deg);
    }
    100% {
        transform: rotate(185deg);
    }
}
@keyframes spin-green {
    0% {
        transform: rotate(-6deg);
    }
    25% {
        transform: rotate(-6deg);
    }
    50% {
        transform: rotate(174deg);
    }
    75% {
        transform: rotate(174deg);
    }
    100% {
        transform: rotate(-6deg);
    }
}
@keyframes spin-red {
    0% {
        transform: rotate(-15deg);
    }
    25% {
        transform: rotate(-15deg);
    }
    50% {
        transform: rotate(-15deg);
    }
    75% {
        transform: rotate(165deg);
    }
    100% {
        transform: rotate(165deg);
    }
}
`;

/**
 * @typedef {object} LoaderPTProps
 * @property {number} [size] The size in pixels of this loader.
 * @property {string} [themeType] The chosen theme type.
 * @property {string} [theme] The chosen theme.
 *
 * @extends {React.Component<LoaderPTProps>}
 */
class LoaderPT extends React.Component {
    /**
     * @param {LoaderPTProps} props
     */
    constructor(props) {
        super(props);
        this.size = this.props.size || 200;

        if (!window.document.getElementById('pt-iobroker-component')) {
            const style = window.document.createElement('style');
            style.setAttribute('id', 'pt-iobroker-component');
            style.innerHTML = ptStyles;
            window.document.head.appendChild(style);
        }
    }

    render() {
        const theme = this.props.themeType || this.props.theme || 'light';
        return <div className={`pt-logo-back logo-background-${theme}`}>
            <div className="pt-logo-div" style={{ width: this.size, height: this.size }}>
                <div style={{ width: 200, height: 200 }}>
                    <div className="pt-loader-blue pt-loader-block" />
                    <div className="pt-loader-green pt-loader-block" />
                    <div className="pt-loader-red pt-loader-block" />
                </div>
            </div>
        </div>;
    }
}

LoaderPT.propTypes = {
    size: PropTypes.number,
    themeType: PropTypes.string,
};

/** @type {typeof LoaderPT} */
const _export = LoaderPT;
export default _export;
