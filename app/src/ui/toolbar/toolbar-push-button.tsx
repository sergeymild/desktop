import * as React from 'react'
import { ToolbarButton } from './button'
import { OcticonSymbol, syncClockwise } from '../octicons'
import classNames from 'classnames'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { TipState } from '../../models/tip'
import { dispatcher } from '../index'

interface IProps {
  readonly isRefreshing: boolean
  readonly repository: Repository | CloningRepository | undefined
  readonly tipKind: TipState | undefined
}

export class ToolbarPushButton extends React.PureComponent<IProps> {
  private push = () => {
    const repository = this.props.repository
    if (repository === undefined) { return }
    if (repository instanceof CloningRepository) { return }
    if (this.props.tipKind !== TipState.Valid) { return }
    dispatcher.push(repository)
  }

  public render() {
    const isEnabled = this.props.tipKind === TipState.Valid

    return <ToolbarButton
      disabled={!isEnabled}
      onClick={this.push}
      className="toolbar-button-new"
      iconClassName={classNames({spin: this.props.isRefreshing})}
      icon={this.props.isRefreshing ? syncClockwise : OcticonSymbol.arrowUp}
      description="Push"
    >
    </ToolbarButton>
  }
}