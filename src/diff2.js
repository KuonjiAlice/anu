import {diffProps} from './diffProps'
import {CurrentOwner} from './CurrentOwner'
import {applyComponentHook} from './lifecycle'
import {
    getChildContext,
    HTML_KEY,
    options,
    noop,
    extend,
    getNodes,
    checkNull,
    recyclables,
    getComponentProps
} from './util'
import {document, createDOMElement} from './browser'
import {setControlledComponent} from './ControlledComponent'
export function render(vnode, container, callback) {
    return renderTreeIntoContainer(vnode, container, callback, {})
}

function renderTreeIntoContainer(vnode, container, callback, parentContext) {
    if (!vnode.vtype) {
        throw new Error(`cannot render ${vnode} to container`)
    }
    if (!container || container.nodeType !== 1) {
        throw new Error(`container ${container} is not a DOM element`)
    }
    var prevVnode = container._component,
        rootNode,
        hostParent = {
            _hostNode: container
        }
    if (!prevVnode) {

        var nodes = getNodes(container)
        var prevRendered = null;
        for (var i = 0, el; el = nodes[i++];) {
            if (el.getAttribute && el.getAttribute('data-reactroot') !== null) {
                hostNode = el
                prevRendered = el

            } else {
                el
                    .parentNode
                    .removeChild(el)
            }
        }
        vnode._hostParent = hostParent

        rootNode = initVnode(vnode, parentContext, prevRendered)
        container.appendChild(rootNode)

        if (readyComponents.length) {
            fireMount()
        }
    } else {
        rootNode = compareTwoVnodes(prevVnode, vnode, container.firstChild, parentContext)
    }
    // 如果存在后端渲染的对象（打包进去），那么在ReactDOM.render这个方法里，它就会判定容器的第一个孩子是否元素节点
    // 并且它有data-reactroot与data-react-checksum，有就根据数据生成字符串，得到比较数

    if (rootNode.setAttribute) {
        rootNode.setAttribute('data-reactroot', '')
    }

    var instance = vnode._instance
    container._component = vnode
    delete vnode._prevRendered
    if (callback) {
        callback()
    }
    if (instance) { //组件返回组件实例，而普通虚拟DOM 返回元素节点
        //   instance._currentElement._hostParent = hostParent
        return instance

    } else {
        return rootNode
    }

}

export function initVnode(vnode, parentContext, prevRendered) {
    let {vtype} = vnode
    let node = null
    if (!vtype) { // init text comment
        node = prevRendered && prevRendered.nodeName === vnode.type
            ? prevRendered
            : createDOMElement(vnode)
        vnode._hostNode = node
        return node
    }

    if (vtype === 1) { // init element

        node = initVelem(vnode, parentContext, prevRendered)

    } else if (vtype === 2) { // init stateful component
        node = initComponent(vnode, parentContext, prevRendered)
    } else if (vtype === 4) { // init stateless component
        node = initVstateless(vnode, parentContext, prevRendered)
    }

    return node
}
var formElements = {
    select: 1,
    textarea: 1,
    input: 1
}
function initVelem(vnode, parentContext, prevRendered) {
    let {type, props} = vnode,
        dom
    if (prevRendered && prevRendered.nodeName.toLowerCase() === type) {
        dom = prevRendered
    } else {
        dom = createDOMElement(vnode)
    }
    vnode._hostNode = dom
    if (prevRendered) {
        aglinChildren(vnode, dom, parentContext, getNodes(prevRendered))
    } else {
        initChildren(vnode, dom, parentContext)
    }
    vnode.checkProps && diffProps(props, {}, vnode, {})

    if (vnode.__ref) {
        readyComponents
            .push(function () {
                vnode.__ref(dom)
            })
    }
    if (formElements[type]) {
        setControlledComponent(vnode)
        if (type === 'select') {
            vnode
                ._wrapperState
                .postUpdate(vnode)

        }
    }

    return dom
}
var readyComponents = []
//将虚拟DOM转换为真实DOM并插入父元素
function initChildren(vnode, parentNode, parentContext) {
    var vchildren = vnode.props.children

    for (let i = 0, n = vchildren.length; i < n; i++) {
        let el = vchildren[i]
        el._hostParent = vnode

        parentNode.appendChild(initVnode(el, parentContext))
    }

}

function aglinChildren(vnode, parentNode, parentContext, childNodes) {
    var vchildren = vnode.props.children,
        insertPoint = childNodes[0] || null,
        j = 0
    for (let i = 0, n = vchildren.length; i < n; i++) {
        let el = vchildren[i]
        el._hostParent = vnode
        var prevDom = childNodes[j]
        var dom = initVnode(el, parentContext, prevDom)
        if (dom === prevDom) {
            j++
        }
        parentNode.insertBefore(dom, insertPoint)
        insertPoint = dom.nextSibling
    }

}

function fireMount() {
    var queue = readyComponents.concat()
    readyComponents.length = 0
    for (var i = 0, cb; cb = queue[i++];) {
        cb()
    }
}

var instanceMap = new Map()

function initComponent(vnode, parentContext, prevRendered) {
    let {type, props} = vnode

    props = getComponentProps(type, props)

    let instance = new type(props, parentContext) //互相持有引用

    vnode._instance = instance
    instance._currentElement = vnode
    instance.props = instance.props || props
    instance.context = instance.context || parentContext

    if (instance.componentWillMount) {
        instance.componentWillMount()
    }
    // 如果一个虚拟DOM vnode的type为函数，那么对type实例化所得的对象instance来说 instance._currentElement =
    // vnode instance有一个render方法，它会生成下一级虚拟DOM ，如果是返回false或null，则变成 空虚拟DOM {type:
    // '#comment', text: 'empty'} 这个下一级虚拟DOM，对于instance来说，为其_rendered属性

    let rendered = safeRenderComponent(instance)
    instance._rendered = rendered
    rendered._hostParent = vnode._hostParent
    if (instance.componentDidMount) {
        readyComponents
            .push(function () {
                instance.componentDidMount()
            })
    }
    if (vnode.__ref) {
        readyComponents
            .push(function () {
                vnode.__ref(instance)
            })
    }
    let dom = initVnode(rendered, getChildContext(instance, parentContext), prevRendered)
    instanceMap.set(instance, dom)
    vnode._hostNode = dom
    //vnode._instance._rendered._hostNode === node

    return dom
}
export function safeRenderComponent(instance) {

    //  instance.setState = instance.forceUpdate = noop   try {
    CurrentOwner.cur = instance
    var rendered = instance.render()
    rendered = checkNull(rendered)
    //  } finally {
    CurrentOwner.cur = null
    //      delete instance.setState      delete instance.forceUpdate  }
    return rendered
}

function initVstateless(vnode, parentContext, prevRendered) {
    var {type, props} = vnode
    props = getComponentProps(type, props)

    let rendered = type(props, parentContext)
    rendered = checkNull(rendered)

    let dom = initVnode(rendered, parentContext, prevRendered)
    vnode._instance = {
        _currentElement: vnode, // ???
        _rendered: rendered
    }
    vnode._hostNode = dom

    rendered._hostParent = vnode._hostParent
    return dom

}

function updateVstateless(lastVnode, nextVnode, node, parentContext) {
    var instance = lastVnode._instance
    let vnode = instance._rendered

    let newVnode = nextVnode.type(nextVnode.props, parentContext)
    newVnode = checkNull(newVnode)

    let dom = compareTwoVnodes(vnode, newVnode, node, parentContext)
    nextVnode._instance = instance
    instance._rendered = newVnode
    nextVnode._hostNode = dom
    return dom
}

function destroyVstateless(vnode, node) {
    destroyVnode(vnode._instance._rendered, node)
}

//将Component中这个东西移动这里
options.immune.refreshComponent = function refreshComponent(instance) { //这里触发视图更新

    reRenderComponent(instance)
    instance._forceUpdate = false
    if (readyComponents.length) {
        fireMount()
    }
}

function reRenderComponent(instance) { // instance._currentElement

    var {props, state, context, lastProps} = instance
    var lastRendered = instance._rendered
    var node = instanceMap.get(instance)

    var hostParent = lastRendered._hostParent
    var nextProps = props
    lastProps = lastProps || props
    var nextState = instance._processPendingState(props, context)

    instance.props = lastProps
    delete instance.lastProps
    //生命周期 shouldComponentUpdate(nextProps, nextState, nextContext)
    if (!instance._forceUpdate && applyComponentHook(instance, 4, nextProps, nextState, context) === false) {
        return node //注意
    }
    //生命周期 componentWillUpdate(nextProps, nextState, nextContext)
    if (instance.componentWillUpdate) {
        instance.componentWillUpdate(nextProps, nextState, context)
    }

    instance.props = nextProps
    instance.state = nextState
    delete instance._updateBatchNumber

    var rendered = safeRenderComponent(instance)
    var childContext = getChildContext(instance, context)
    instance._rendered = rendered
    rendered._hostParent = hostParent

    var dom = compareTwoVnodes(lastRendered, rendered, node, childContext)
    instanceMap.set(instance, dom)
    instance._currentElement._hostNode = dom
    if (instance.componentDidUpdate) {
        instance.componentDidUpdate(nextProps, nextState, context)
    }

    return dom
}

export function compareTwoVnodes(vnode, newVnode, node, parentContext) {
    let newNode = node
    if (newVnode == null) {
        // remove
        destroyVnode(vnode, node)
        node
            .parentNode
            .removeChild(node)
    } else if (vnode.type !== newVnode.type || vnode.key !== newVnode.key) {

        // replace
        destroyVnode(vnode, node)
        newNode = initVnode(newVnode, parentContext)
        node
            .parentNode
            .replaceChild(newNode, node)
    } else if (vnode !== newVnode) {
        // same type and same key -> update
        newNode = updateVnode(vnode, newVnode, node, parentContext)
    } else if (vnode._prevRendered) {
        newNode = updateVnode(vnode, newVnode, node, parentContext)
    }
    return newNode
}

export function destroyVnode(vnode, node) {
    let {vtype} = vnode
    if (!vtype) {
        //   vnode._hostNode = null   vnode._hostParent = null
    } else if (vtype === 1) { // destroy element
        destroyVelem(vnode, node)
    } else if (vtype === 2) { // destroy state component
        destroyVcomponent(vnode, node)
    } else if (vtype === 4) { // destroy stateless component
        destroyVstateless(vnode, node)
    }
}

function destroyVelem(vnode, node) {
    var {props} = vnode
    var vchildren = props.children
    var childNodes = node.childNodes
    for (let i = 0, len = vchildren.length; i < len; i++) {
        destroyVnode(vchildren[i], childNodes[i])
    }

    vnode.__ref && vnode.__ref(null)
    vnode._hostNode = null
    vnode._hostParent = null
}

function destroyVcomponent(vnode, node) {
    var instance = vnode._instance
    if (instance) {
        instanceMap.delete(instance)
        if (instance.componentWillUnmount) {
            instance.componentWillUnmount()
        }
        vnode._instance = instance._currentElement = instance.props = null
        destroyVnode(instance._rendered, node)
    }
}

function updateVnode(lastVnode, nextVnode, node, parentContext) {
    let {vtype, props} = lastVnode

    if (vtype === 2) {
        //类型肯定相同的
        return updateVcomponent(lastVnode, nextVnode, node, parentContext)
    }

    if (vtype === 4) {
        return updateVstateless(lastVnode, nextVnode, node, parentContext)
    }

    // ignore VCOMMENT and other vtypes
    if (vtype !== 1) {

        return node
    }
    var onlyAdd = false
    var nextProps = nextVnode.props
    if (props[HTML_KEY]) {
        while (node.firstChild) {
            node.removeChild(node.firstChild)
        }
        updateVelem(lastVnode, nextVnode, node, parentContext)
        initChildren(nextVnode, node, parentContext)
    } else {
        if (nextProps[HTML_KEY]) {
            node.innerHTML = nextProps[HTML_KEY].__html
        } else {
            updateChildren(lastVnode, nextVnode, node, parentContext)
        }
        updateVelem(lastVnode, nextVnode, node, parentContext)
    }
    return node
}
/**
  *
  *
  * @param {any} lastVnode
  * @param {any} nextVnode
  * @param {any} node
  * @returns
  */
function updateVelem(lastVnode, nextVnode, node) {
    nextVnode._hostNode = node
    if (lastVnode.checkProps || nextVnode.checkProps) {
        diffProps(nextVnode.props, lastVnode.props, nextVnode, lastVnode)
    }
    if (nextVnode._wrapperState) {
        nextVnode
            ._wrapperState
            .postUpdate(nextVnode)
    }
    if (nextVnode.__ref) {
        readyComponents
            .push(function () {
                nextVnode.__ref(nextVnode._hostNode)
            })
    }
    return node
}

function updateVcomponent(lastVnode, nextVnode, node, parentContext) {
    var instance = nextVnode._instance = lastVnode._instance
    var nextProps = nextVnode.props

    if (instance.componentWillReceiveProps) {
        instance.componentWillReceiveProps(nextProps, parentContext)
    }
    instance.lastProps = instance.props
    instance.props = nextProps
    instance.context = parentContext
    if (nextVnode.__ref) {

        nextVnode
            .push(function () {
                nextVnode.__ref(instance)
            })
    }

    return reRenderComponent(instance)
}

function updateChildren(vnode, newVnode, node, parentContext) {
    if (vnode._prevRendered) {

        return
    }
    let patches = {
        removes: [],
        updates: [],
        creates: []
    }
    diffChildren(patches, vnode, newVnode, node, parentContext)
    patches
        .removes
        .forEach(applyDestroy)
    patches
        .updates
        .forEach(applyUpdate)
    patches
        .creates
        .forEach(applyCreate)
}

function diffChildren(patches, vnode, newVnode, node, parentContext) {
    let vchildren = vnode.props.children
    let childNodes = node.childNodes
    let newVchildren = newVnode.props.children
    let vchildrenLen = vchildren.length
    let newVchildrenLen = newVchildren.length

    if (vchildrenLen === 0) {
        if (newVchildrenLen > 0) {
            for (let i = 0; i < newVchildrenLen; i++) {
                patches
                    .creates
                    .push({vnode: newVchildren[i], parentNode: node, parentContext: parentContext, index: i})
            }
        }
        return
    } else if (newVchildrenLen === 0) {
        for (let i = 0; i < vchildrenLen; i++) {
            patches
                .removes
                .push({vnode: vchildren[i], node: childNodes[i]})
        }
        return
    }

    let updates = Array(newVchildrenLen)
    let removes = null
    let creates = null
    // isEqual
    for (let i = 0; i < vchildrenLen; i++) {
        let vnode = vchildren[i]
        for (let j = 0; j < newVchildrenLen; j++) {
            if (updates[j]) {
                continue
            }
            let newVnode = newVchildren[j]
            if (vnode === newVnode) {
                updates[j] = {
                    shouldIgnore: true,
                    vnode: vnode,
                    newVnode: newVnode,
                    node: childNodes[i],
                    parentContext: parentContext,
                    index: j
                }
                vchildren[i] = null
                break
            }
        }
    }

    // isSimilar
    for (let i = 0; i < vchildrenLen; i++) {
        let vnode = vchildren[i]
        if (vnode === null) {
            continue
        }
        let shouldRemove = true
        for (let j = 0; j < newVchildrenLen; j++) {
            if (updates[j]) {
                continue
            }
            let newVnode = newVchildren[j]
            if (newVnode.type === vnode.type && newVnode.key === vnode.key) {
                updates[j] = {
                    vnode: vnode,
                    newVnode: newVnode,
                    node: childNodes[i],
                    parentContext: parentContext,
                    index: j
                }
                shouldRemove = false
                break
            }
        }
        if (shouldRemove) {
            if (!removes) {
                removes = []
            }
            removes.push({vnode: vnode, node: childNodes[i]})
        }
    }

    for (let i = 0; i < newVchildrenLen; i++) {
        let item = updates[i]
        if (!item) {
            if (!creates) {
                creates = []
            }
            creates.push({vnode: newVchildren[i], parentNode: node, parentContext: parentContext, index: i})
        } else if (item.vnode.vtype === 1) {
            diffChildren(patches, item.vnode, item.newVnode, item.node, item.parentContext)
        }
    }
    if (removes) {
        __push.apply(patches.removes, removes)
    }
    if (creates) {
        __push.apply(patches.creates, creates)
    }
    __push.apply(patches.updates, updates)
}
var __push = Array.prototype.push

function applyUpdate(data) {
    if (!data) {
        return
    }
    let vnode = data.vnode
    let nextVnode = data.newVnode
    let dom = data.node

    // update
    if (!data.shouldIgnore) {
        if (!vnode.vtype) {
            if (vnode.text !== nextVnode.text) {
                dom.nodeValue = nextVnode.text
            }
        } else if (vnode.vtype === 1) {
            updateVelem(vnode, nextVnode, dom, data.parentContext)
        } else if (vnode.vtype === 4) {
            dom = updateVstateless(vnode, nextVnode, dom, data.parentContext)
        } else if (vnode.vtype === 2) {
            dom = updateVcomponent(vnode, nextVnode, dom, data.parentContext)
        }
    }
    // re-order
    let currentNode = dom.parentNode.childNodes[data.index]
    if (currentNode !== dom) {
        dom
            .parentNode
            .insertBefore(dom, currentNode)
    }
    return dom
}

function applyDestroy(data) {
    destroyVnode(data.vnode, data.node)
    data
        .node
        .parentNode
        .removeChild(data.node)
    var node = data.node
    var nodeName = node.__n || (node.__n = node.nodeName.toLowerCase())
    if (recyclables[nodeName] && recyclables[nodeName].length < 72) {
        recyclables[nodeName].push(node)
    } else {
        recyclables[nodeName] = [node]
    }
}

function applyCreate(data) {
    let node = initVnode(data.vnode, data.parentContext)
    data
        .parentNode
        .insertBefore(node, data.parentNode.childNodes[data.index])
}
