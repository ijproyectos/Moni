import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// The first navigation in a test loads lazy route chunks; on a cold CI machine that can exceed the 1s default of
// findBy*/waitFor and make the navigation suites fail in cascade. A longer ceiling only gives slow machines room.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
})
