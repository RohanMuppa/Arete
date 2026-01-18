'use client'

import { Editor } from '@monaco-editor/react'
import { useState } from 'react'

interface TestResult {
  case: number
  passed: boolean
  input: string
  expected: string
  actual?: string
}

interface CodeEditorProps {
  onCodeChange?: (code: string) => void
  onRunCode?: (code: string) => void
}

const STARTER_CODE = `def twoSum(nums: list[int], target: int) -> list[int]:
    """
    Given an array of integers nums and an integer target,
    return indices of the two numbers that add up to target.
    """
    # Write your solution here
    pass
`

export default function CodeEditor({ onCodeChange, onRunCode }: CodeEditorProps) {
  const [code, setCode] = useState(STARTER_CODE)
  const [testResults, setTestResults] = useState<TestResult[] | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const handleCodeChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value)
      onCodeChange?.(value)
    }
  }

  const handleRunCode = async () => {
    setIsRunning(true)

    setTimeout(() => {
      const mockResults: TestResult[] = [
        {
          case: 1,
          passed: true,
          input: '[2, 7, 11, 15], target = 9',
          expected: '[0, 1]',
          actual: '[0, 1]'
        },
        {
          case: 2,
          passed: true,
          input: '[3, 2, 4], target = 6',
          expected: '[1, 2]',
          actual: '[1, 2]'
        },
        {
          case: 3,
          passed: false,
          input: '[3, 3], target = 6',
          expected: '[0, 1]',
          actual: 'None'
        }
      ]

      setTestResults(mockResults)
      setIsRunning(false)
      onRunCode?.(code)
    }, 1500)
  }

  const passedTests = testResults?.filter(r => r.passed).length ?? 0
  const totalTests = testResults?.length ?? 0

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#cccccc]">solution.py</span>
          <span className="text-xs text-[#6b6b6b]">Python 3.11</span>
        </div>

        <button
          onClick={handleRunCode}
          disabled={isRunning}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#0e639c] hover:bg-[#1177bb] text-white rounded transition-colors disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Running...
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Run Code
            </>
          )}
        </button>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="python"
          value={code}
          onChange={handleCodeChange}
          theme="vs-dark"
          options={{
            fontSize: 14,
            fontFamily: "'IBM Plex Mono', 'Consolas', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            padding: { top: 12, bottom: 12 },
            bracketPairColorization: { enabled: true },
            // Completely disable ALL autocomplete/suggestions
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            acceptSuggestionOnEnter: 'off',
            tabCompletion: 'off',
            wordBasedSuggestions: 'off',
            parameterHints: { enabled: false },
            autoClosingBrackets: 'never',
            autoClosingQuotes: 'never',
            autoSurround: 'never',
            formatOnType: false,
            formatOnPaste: false,
            suggest: { enabled: false },
            inlineSuggest: { enabled: false },
            hover: { enabled: false },
            codeLens: false,
            contextmenu: false,
            snippetSuggestions: 'none',
            links: false,
          }}
        />
      </div>

      {/* Test Results Panel */}
      {testResults && (
        <div className="flex-shrink-0 border-t border-[#3c3c3c] bg-[#1e1e1e] max-h-48 overflow-y-auto">
          <div className="px-4 py-2 border-b border-[#3c3c3c] flex items-center justify-between">
            <span className="text-sm text-[#cccccc]">Test Results</span>
            <span className={`text-sm font-mono ${
              passedTests === totalTests ? 'text-[#4ec9b0]' : 'text-[#ce9178]'
            }`}>
              {passedTests}/{totalTests} passed
            </span>
          </div>

          <div className="divide-y divide-[#3c3c3c]">
            {testResults.map((result) => (
              <div key={result.case} className="px-4 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs ${result.passed ? 'text-[#4ec9b0]' : 'text-[#f14c4c]'}`}>
                    {result.passed ? '✓' : '✗'}
                  </span>
                  <span className="text-sm text-[#cccccc]">Test {result.case}</span>
                </div>
                <div className="text-xs text-[#6b6b6b] font-mono space-y-0.5">
                  <div>Input: {result.input}</div>
                  <div className="flex gap-4">
                    <span>Expected: {result.expected}</span>
                    {!result.passed && result.actual && (
                      <span className="text-[#f14c4c]">Got: {result.actual}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
