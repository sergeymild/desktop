import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'
import { BannerDismissTimeout } from '../../lib/stores'

export function SuccessfulCherryPick({
  ourBranch,
  theirBranch,
}: {
  readonly ourBranch: string
  readonly theirBranch?: string
}) {
  const message =
    theirBranch !== undefined ? (
      <span>
        {'Successfully cherry picked '}
        <strong>{theirBranch}</strong>
        {' into '}
        <strong>{ourBranch}</strong>
      </span>
    ) : (
      <span>
        {'Successfully cherry picked into '}
        <strong>{ourBranch}</strong>
      </span>
    )

  return (
    <Banner id="successful-merge" timeout={BannerDismissTimeout}>
      <Octicon className="check-icon" symbol={OcticonSymbol.check} />
      <div className="banner-message">{message}</div>
    </Banner>
  )
}
