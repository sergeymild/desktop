import * as React from 'react'
import { OcticonSymbol } from '../octicons'
import { ToolbarButton } from './button'
import { connect, IGlobalState } from '../index'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'

interface IProps {
  readonly filesCount: number
  readonly dispatcher: Dispatcher
  readonly repository: Repository | null
}

const mapStateToProps = (state: IGlobalState): IProps => ({
  filesCount: state.appStore.possibleSelectedState?.state?.changesState?.workingDirectory.files.length ?? 0,
  dispatcher: state.dispatcher,
  repository: state.appStore.getRepository()
})

class LocalToolbarStashButton extends React.Component<IProps> {
  public shouldComponentUpdate(
    nextProps: Readonly<IProps>,
    nextState: Readonly<{}>,
    nextContext: any): boolean {
    return nextProps.filesCount !== this.props.filesCount
  }

  private onStashChanges = () => {
    const repository = this.props.repository
    if (repository === null) return
    this.props.dispatcher.createStashForCurrentBranch(repository)
  }

  public render() {
    return (
      <ToolbarButton
        title="Stash"
        icon={OcticonSymbol.stash}
        onClick={this.onStashChanges}
        disabled={this.props.filesCount === 0}
        className="vertically"
      />
    )
  }
}

export const ToolbarStashButton = connect(mapStateToProps)(LocalToolbarStashButton)