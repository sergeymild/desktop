import { TreeData } from './branches-tree-list'
import { Branch } from '../../models/branch'

type Matcher = (filterText: string, node: TreeData) => boolean

export const defaultMatcher: Matcher = (filterText: string, node: TreeData): boolean => {
  return node.name.toLowerCase().includes(filterText.toLowerCase());
};

export const findNode = (node: TreeData, filter: string, matcher: Matcher): boolean => {
  return matcher(filter, node) ||
    !!(node.children.length && node.children.find(child => findNode(child, filter, matcher)) !== undefined);
};

export const filterTree = (node: TreeData, filter: string, matcher = defaultMatcher): TreeData => {
  // If im an exact match then all my children get to stay
  if (matcher(filter, node) || !node.children) {
    return node;
  }
  // If not then only keep the ones that match or have matching descendants
  const filtered = node.children
    .filter(child => findNode(child, filter, matcher))
    .map(child => filterTree(child, filter, matcher));
  return Object.assign({}, node, {children: filtered});
};

export const expandFilteredNodes = (node: TreeData, filter: string, matcher = defaultMatcher) => {
  let children = node.children;
  if (!children || children.length === 0) {
    return Object.assign({}, node, {toggled: false});
  }
  const childrenWithMatches = node.children.filter(child => findNode(child, filter, matcher));
  const shouldExpand = childrenWithMatches.length > 0;
  // If im going to expand, go through all the matches and see if thier children need to expand
  if (shouldExpand) {
    children = childrenWithMatches.map(child => {
      return expandFilteredNodes(child, filter, matcher);
    });
  }
  return Object.assign({}, node, {
    children: children,
    toggled: shouldExpand
  });
};


// @ts-ignore
const findWhere = (array: Array<TreeData>, key: string, value: string): TreeData | null => {
  let t = 0
  // @ts-ignore
  while (t < array.length && array[t][key] !== value) t++
  if (t < array.length) return array[t]
  return null
}

export const arrangeIntoTree = (branches: ReadonlyArray<Branch>) => {
  const map = new Map<string, Branch>()
  const paths: Array<Array<string>> = branches.map(b => {
    map.set(b.name, b)
    return b.name.split('/')
  })

  // Adapted from http://brandonclapp.com/arranging-an-array-of-flat-paths-into-a-json-tree-like-structure/
  const tree: Array<TreeData> = []
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    let currentLevel = tree
    for (let j = 0; j < path.length; j++) {
      const part = path[j]
      const existingPath = findWhere(currentLevel, 'name', part)
      if (existingPath) {
        currentLevel = existingPath.children || []
      } else {
        const newPart: TreeData = {
          name: part,
          item: map.get(path.join('/'))!,
          children: [],
          toggled: false
        }

        currentLevel.push(newPart)
        currentLevel = newPart.children
      }
    }
  }

  // @ts-ignore
  return tree
}
