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
  readonly ahead: number
}

export class ToolbarPushButton extends React.PureComponent<IProps> {
  private push = () => {
    const repository = this.props.repository
    if (repository === undefined) { return }
    if (repository instanceof CloningRepository) { return }
    if (this.props.tipKind !== TipState.Valid) { return }
    dispatcher.pushRepository(repository)
  }

  private renderAhead(): JSX.Element | null {
    console.log(`renderAhead ahead: ${this.props.ahead}`)
    if (this.props.ahead === 0) return null

    return (
      <div className="ahead-behind">
        <span key="ahead">{this.props.ahead}</span>
      </div>
    )
  }

  public render() {
    const isEnabled = this.props.tipKind === TipState.Valid

    return <ToolbarButton
      disabled={!isEnabled}
      onClick={this.push}
      className="toolbar-button-new"
      iconClassName={classNames({spin: this.props.isRefreshing})}
      icon={this.props.isRefreshing ? syncClockwise : OcticonSymbol.arrowUp}
      title="Push"
    >
      {this.renderAhead()}
    </ToolbarButton>
  }
}