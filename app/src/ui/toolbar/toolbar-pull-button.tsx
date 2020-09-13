import * as React from 'react'
import { ToolbarButton } from './button'
import { OcticonSymbol, syncClockwise } from '../octicons'
import classNames from 'classnames'
import { Repository } from '../../models/repository'
import { dispatcher } from '../index'
import { CloningRepository } from '../../models/cloning-repository'
import { TipState } from '../../models/tip'

interface IProps {
  readonly isRefreshing: boolean
  readonly repository: Repository | CloningRepository | undefined
  readonly tipKind: TipState | undefined
}

export class ToolbarPullButton extends React.PureComponent<IProps> {

  private pull = () => {
    const repository = this.props.repository
    if (repository === undefined) { return }
    if (repository instanceof CloningRepository) { return }
    if (this.props.tipKind !== TipState.Valid) { return }
    dispatcher.pull(repository)
  }

  public render() {
    const isEnabled = this.props.tipKind === TipState.Valid

    return <ToolbarButton
      onClick={this.pull}
      disabled={!isEnabled}
      className="toolbar-button-new"
      iconClassName={classNames({spin: this.props.isRefreshing})}
      icon={this.props.isRefreshing ? syncClockwise : OcticonSymbol.download}
      description="Pull"
    >
    </ToolbarButton>
  }
}