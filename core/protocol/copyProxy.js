import proxify from './proxify.js';

function copyProxy(proxy, schema) {
    return proxify(proxy, schema)
}

export default copyProxy;