import React from 'react';
import PropTypes from 'prop-types';

const IconState = props => {
    return <svg onClick={e => props.onClick && props.onClick(e)} viewBox="0 0 320 320" width={props.width || 20} height={props.height || props.width || 20} xmlns="http://www.w3.org/2000/svg" className={props.className}>
        <rect fill="none" rx="32" height="272" width="267" y="25" x="25" strokeWidth="15" stroke="currentColor" />
        <ellipse fill="none" ry="54" rx="54" cy="160" cx="160" fillOpacity="null" strokeOpacity="null" strokeWidth="15" stroke="currentColor" />
    </svg>;
}

IconState.propTypes = {
    onClick: PropTypes.func,
    width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    className: PropTypes.string
};

export default IconState;