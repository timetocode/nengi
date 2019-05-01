import proxify from './proxify';

function copyProxy(proxy, schema) {
    return proxify(proxy, schema)
}

export default copyProxy;