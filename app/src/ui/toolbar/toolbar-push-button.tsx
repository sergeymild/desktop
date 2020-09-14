import * as React from 'react'
import { ToolbarButton } from './button'
import { OcticonSymbol, syncClockwise } from '../octicons'
import classNames from 'classnames'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { TipState } from '../../models/tip'
import { dispatcher } from '../index'
import { IAheadBehind } from '../../models/branch'

interface IProps {
  readonly isRefreshing: boolean
  readonly repository: Repository | CloningRepository | undefined
  readonly tipKind: TipState | undefined
  readonly aheadBehind: IAheadBehind | null
}

export class ToolbarPushButton extends React.PureComponent<IProps> {
  private push = () => {
    const repository = this.props.repository
    if (repository === undefined) { return }
    if (repository instanceof CloningRepository) { return }
    if (this.props.tipKind !== TipState.Valid) { return }
    dispatcher.pushRepository(repository)
  }

  private renderAheadBehind(): JSX.Element | null {
    const aheadBehind = this.props.aheadBehind
    if (!aheadBehind) return null
    const { ahead } = aheadBehind
    if (ahead === 0) return null

    console.log(`renderAheadBehind ahead: ${ahead}`)
    if (ahead === 0) return null

    return (
      <div className="ahead-behind">
        <span key="ahead">{ahead}</span>
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
      {this.renderAheadBehind()}
    </ToolbarButton>
  }
}