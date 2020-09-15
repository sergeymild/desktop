import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'

interface IProps {
  readonly stashName: string
}

export const StashApplied: React.FC<IProps> = (stashName) => {
  const message = <span>Stash <strong>{stashName}</strong> Applied.</span>

  return (
    <Banner id="successful-merge" timeout={5000}>
      <div className="green-circle">
        <Octicon className="check-icon" symbol={OcticonSymbol.check} />
      </div>
      <div className="banner-message">{message}</div>
    </Banner>
  )
}