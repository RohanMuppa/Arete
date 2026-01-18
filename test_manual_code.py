
import logging
from agent.livekit_agent import InterviewerAgent
from agent.api.routes import PROBLEM_BANK

# Mock logging
logging.basicConfig(level=logging.INFO)

def test_code_execution():
    print("--- Testing Code Execution Logic ---")
    
    # 1. Setup Mock State and Problem
    problem = PROBLEM_BANK["two_sum"]
    state = {
        "code_snapshot": "",
        "problem": problem
    }
    
    # 2. Instantiate Agent
    print(f"Initializing agent for problem: {problem['title']}")
    try:
        agent = InterviewerAgent(problem, state)
    except Exception as e:
        print(f"Failed to init agent: {e}")
        # livekit.agents.voice.Agent might need arguments?
        # It calls super().__init__(instructions=...)
        # Should be fine.
        return

    # 3. Test Empty Code
    print("\nTest 1: Empty Code")
    result = agent.run_tests()
    print(f"Result: {result}")
    
    # 4. Test Incorrect Code (Starter Code)
    print("\nTest 2: Starter Code (Should Fail)")
    state["code_snapshot"] = problem["starter_code"]
    result = agent.run_tests()
    print(f"Result: {result}")

    # 5. Test Correct Code
    print("\nTest 3: Correct Code")
    correct_solution = """
def twoSum(nums: list[int], target: int) -> list[int]:
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []
"""
    state["code_snapshot"] = correct_solution
    result = agent.run_tests()
    print(f"Result: {result}")

    # 5.5 Test Incorrect Logic (Fails Constraints)
    print("\nTest 3.5: Incorrect Logic (Returns same element twice)")
    incorrect_logic = """
def twoSum(nums: list[int], target: int) -> list[int]:
    for i in range(len(nums)):
        for j in range(len(nums)):
            # Bug: Does not check if i != j
            if nums[i] + nums[j] == target:
                return [i, j]
    return []
"""
    state["code_snapshot"] = incorrect_logic
    result = agent.run_tests()
    print(f"Result: {result}")

    # 5.6 Test Infinite Loop (Timeout)
    print("\nTest 3.6: Infinite Loop (Should Timeout)")
    infinite_loop = """
def twoSum(nums: list[int], target: int) -> list[int]:
    while True:
        pass
    return []
"""
    state["code_snapshot"] = infinite_loop
    result = agent.run_tests()
    print(f"Result: {result}")
    
    # 6. Test Data Channel Logic Mock
    print("\nTest 4: Data Channel Logic (Mock Update)")
    # Simulating what on_data does
    new_snapshot = "print('Hello World')"
    state["code_snapshot"] = new_snapshot
    print(f"State updated to: {state['code_snapshot']}")
    # Verify agent sees it
    if agent.state["code_snapshot"] == new_snapshot:
        print("Agent state synced successfully!")
    else:
        print("Agent state failed to sync.")

if __name__ == "__main__":
    test_code_execution()
