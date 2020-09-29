import * as React from 'react'
import { Branch } from '../../models/branch'
import { ClickSource, SelectionSource } from '../lib/list'
import { TextBox } from '../lib/text-box'
import { IBranchListItem } from './group-branches'
import { IMatches } from '../../lib/fuzzy-find'
// @ts-ignore
import { decorators, Treebeard } from 'react-treebeard'
import uuid from 'uuid'
import { Row } from '../lib/row'
import { dispatcher } from '../index'
import { Octicon, OcticonSymbol } from '../octicons'
import moment from 'moment'
import { Button } from '../lib/button'

interface IProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly selectedBranch: Branch | null
  readonly onFilterKeyDown?: (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => void
  readonly onItemClick?: (item: Branch, source: ClickSource) => void

  readonly onSelectionChanged?: (
    selectedItem: Branch | null,
    source: SelectionSource,
  ) => void

  readonly filterText: string
  readonly onFilterTextChanged: (filterText: string) => void
  readonly canCreateNewBranch: boolean
  readonly onCreateNewBranch?: (name: string) => void

  readonly textbox?: TextBox
  readonly renderBranch: (
    item: IBranchListItem,
    matches: IMatches,
  ) => JSX.Element

  readonly onFilterListResultsChanged?: (resultCount: number) => void
}

// eslint-disable-next-line @typescript-eslint/naming-convention
interface TreeData {
  id: string
  name: string
  toggled: boolean
  item: Branch
  children: Array<TreeData>
}

interface IState {
  readonly nodes: Array<TreeData>
}

interface IHeaderDecoratorProps {
  readonly node: TreeData
}

const HeaderDecorator: React.FC<IHeaderDecoratorProps> = ({node}) => {
  const icon = node.children.length > 0
    ? OcticonSymbol.fileDirectory
    : OcticonSymbol.gitBranch
  const date = node.item.tip.author.date ? moment(node.item.tip.author.date).fromNow() : ''
  return (
    <div style={{display: "flex", alignItems: "center", height: '30px'}} className="branches-list-item">
      <Octicon className="icon" symbol={icon}/>
      <div className="name" title={name}>
        {node.name}
      </div>
      <div className="description">
        {date}
      </div>
    </div>
  )
}

const Toggle: React.FC = () => {
  return (
    <div/>
  )
}

// @ts-ignore
const arrangeIntoTree = (branches: ReadonlyArray<Branch>) => {
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
          id: uuid.v4(),
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

  // @ts-ignore
  function findWhere(array: Array<TreeData>, key: string, value: string): TreeData | null {
    // Adapted from https://stackoverflow.com/questions/32932994/findwhere-from-underscorejs-to-jquery
    let t = 0 // t is used as a counter
    // @ts-ignore
    while (t < array.length && array[t][key] !== value) {
      t++
    } // find the index where the id is the as the aValue

    if (t < array.length) {
      return array[t]
    } else {
      return null
    }
  }
}

export class BranchesTreeList extends React.Component<IProps, IState> {
  public constructor(props: IProps) {
    super(props)
    this.state = {
      nodes: arrangeIntoTree(props.allBranches),
    }
  }

  public renderTextBox() {
    return (
      <TextBox
        type="search"
        autoFocus={true}
        placeholder={'Filter'}
        className="filter-list-filter-field"
        onValueChanged={this.onFilterValueChanged}
        value={this.props.filterText}
      />
    )
  }

  private onFilterValueChanged = (text: string) => {
    if (this.props.onFilterTextChanged) {
      return this.props.onFilterTextChanged(text)
    }
    dispatcher.setRepositoryFilterText(text)
  }

  private onToggle = (node: TreeData, toggled: boolean) => {
    console.log(node, toggled)
    node.toggled = true;
    if (node.children) {
      node.toggled = toggled;
    }
    this.setState({nodes: this.state.nodes});
  }

  private onCreateNewBranch = () => {
    if (this.props.onCreateNewBranch) {
      this.props.onCreateNewBranch("")
    }
  }

  private onRenderNewButton = () => {
    return this.props.canCreateNewBranch ? (
      <Button className="new-branch-button" onClick={this.onCreateNewBranch}>
        New branch
      </Button>
    ) : null
  }

  public render() {
    return <div style={{height: '100%', overflow: "scroll"}} className="branches-list filter-list">
      <Row className="filter-field-row">
        {this.renderTextBox()}
        {this.onRenderNewButton()}
      </Row>
      <Treebeard
        data={this.state.nodes}
        onToggle={this.onToggle}
        decorators={{...decorators, Header: HeaderDecorator, Toggle}}
        style={{
          tree: {
            base: {
              listStyle: 'none',
              backgroundColor: 'var(--primary-background)',
              margin: 0,
              padding: 0,
              color: 'var(--primary-text-color)',
              fontFamily: 'var(--font-family-sans-serif)',
              fontSize: '14px'
            },
          }
        }}
      />
    </div>
  }
}