import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'
import { BannerDismissTimeout } from '../../lib/stores'

interface IProps {
  readonly stashName: string
}

export const StashPopped: React.FC<IProps> = ({stashName}) => {
  const message = <span>Stash <strong>{stashName}</strong> Popped.</span>

  return (
    <Banner id="successful-merge" timeout={BannerDismissTimeout}>
      <Octicon className="check-icon" symbol={OcticonSymbol.check} />
      <div className="banner-message">{message}</div>
    </Banner>
  )
}