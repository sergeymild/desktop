import * as React from 'react'
import { Branch } from '../../models/branch'
import { ClickSource } from '../lib/list'
import { TextBox } from '../lib/text-box'
// @ts-ignore
import { decorators, Treebeard } from 'react-treebeard'
import { Row } from '../lib/row'
import { Octicon, OcticonSymbol } from '../octicons'
import moment from 'moment'
import { Button } from '../lib/button'
import * as treeHelpers from './tree-helpers'
import { IMenuItem } from '../../lib/menu-item'
import { showContextualMenu } from '../main-process-proxy'
import { connect, dispatcher, IGlobalState } from '../index'
import { PopupType } from '../../models/popup'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'

const baseStyles = {
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
}

interface IProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly selectedBranch: Branch | null
  readonly onItemClick?: (item: Branch, source: ClickSource) => void
  readonly onContextMenu?: (branch: Branch) => void

  readonly onSelectionChanged?: (selectedItem: Branch | null) => void

  readonly canCreateNewBranch: boolean
  readonly onCreateNewBranch?: (name: string) => void
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export interface TreeData {
  name: string
  toggled: boolean
  item?: Branch
  children: Array<TreeData>
}

interface IState {
  readonly rawNodes: Array<TreeData>
  readonly nodes: Array<TreeData>
  readonly filterText: string
}

interface IHeaderDecoratorProps {
  readonly onSelect: (node: TreeData) => void
  readonly node: TreeData
}

const onRename = (branch: Branch, repository: Repository | CloningRepository | null) => {
  if (!(repository instanceof Repository)) return
  dispatcher.closeCurrentFoldout()
  dispatcher.showPopup({
    type: PopupType.RenameBranch,
    repository: repository,
    branch: branch
  })
}

const onDelete = (branch: Branch, repository: Repository | CloningRepository | null) => {
  if (!(repository instanceof Repository)) return
  dispatcher.closeCurrentFoldout()
  dispatcher.showPopup({
    type: PopupType.DeleteBranch,
    existsOnRemote: true,
    branch: branch,
    repository: repository
  })
}

const onContextMenu = (branch: Branch | undefined, repository: Repository | CloningRepository | null) => {
  if (branch === undefined) return
  const items: IMenuItem[] = [
    {
      label: "Rename",
      action: () => onRename(branch, repository),
      enabled: true,
    },

    {type: 'separator'},
    {
      label: "Delete",
      action: () => onDelete(branch, repository),
      enabled: true,
    }
  ]

  showContextualMenu(items)
}

interface IExternalHeaderDecoratorProps {
  readonly repository: Repository | CloningRepository | null
}

const mapStateToProps = (state: IGlobalState): IExternalHeaderDecoratorProps => ({
  repository: state.appStore.selectedRepository
})

class LocalHeaderDecorator extends React.PureComponent<IHeaderDecoratorProps & IExternalHeaderDecoratorProps> {
  private onContextMenu = () => {
    if (this.props.node.children.length > 0) return;
    onContextMenu(this.props.node.item, this.props.repository)
  }

  public render() {
    const {node} = this.props
    const icon = node.children.length > 0
      ? OcticonSymbol.fileDirectory
      : OcticonSymbol.gitBranch
    const date = node.item?.tip.author.date ? moment(node.item.tip.author.date).fromNow() : ''
    return (
      <div
        style={{display: "flex", alignItems: "center", height: '30px'}}
        className="branches-list-item"
        onContextMenu={this.onContextMenu}
      >
        <Octicon className="icon" symbol={icon}/>
        <div className="name" title={name}>{node.name}</div>
        <div className="description">{date}</div>
      </div>
    )
  }
}

const HeaderDecorator =
  connect<IExternalHeaderDecoratorProps, {}, IHeaderDecoratorProps>(mapStateToProps)(LocalHeaderDecorator)

const Toggle: React.FC = () => {
  return (
    <div/>
  )
}

// @ts-ignore

export class BranchesTreeList extends React.Component<IProps, IState> {
  public constructor(props: IProps) {
    super(props)
    const nodes = treeHelpers.arrangeIntoTree(props.allBranches)
    this.state = {
      rawNodes: nodes,
      nodes: nodes,
      filterText: ""
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
        onSearchCleared={() => this.onFilterValueChanged("")}
        value={this.state.filterText}
      />
    )
  }

  private onFilterValueChanged = (text: string) => {
    const filter = text.trim();
    if (!filter) return this.setState({nodes: this.state.rawNodes, filterText: ""});
    const node = {children: this.state.rawNodes, toggled: true, name: "", id: ""}

    let filtered: TreeData = treeHelpers.filterTree(node, filter);
    filtered = treeHelpers.expandFilteredNodes(filtered, filter);
    this.setState(() => ({nodes: filtered.children, filterText: text}));
  }

  private onToggle = (node: TreeData, toggled: boolean) => {
    node.toggled = true;
    if (node.children) {
      node.toggled = toggled;
    }
    this.setState({nodes: this.state.nodes});
  }

  private onCreateNewBranch = () => {
    if (this.props.onCreateNewBranch) {
      this.props.onCreateNewBranch(this.state.filterText)
    }
  }

  private onRenderNewButton = () => {
    return this.props.canCreateNewBranch ? (
      <Button className="new-branch-button" onClick={this.onCreateNewBranch}>
        New branch
      </Button>
    ) : null
  }

  private onSelect = (node: TreeData) => {
    if (!this.props.onSelectionChanged) return
    this.props.onSelectionChanged(node.item ?? null)
  }

  public render() {
    return <div style={{height: '100%', overflow: "scroll"}} className="branches-list filter-list">
      <Row className="filter-field-row">
        {this.renderTextBox()}
        {this.onRenderNewButton()}
      </Row>
      <Treebeard
        onSelect={this.onSelect}

        data={this.state.nodes}
        onToggle={this.onToggle}
        decorators={{...decorators, Header: HeaderDecorator, Toggle}}
        style={baseStyles}
      />
    </div>
  }
}