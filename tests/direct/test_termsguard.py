import json
import pytest

CONTRACT = "contracts/TermsGuard.py"


def draft(contract, direct_vm, owner, title="Delivery SLA"):
    direct_vm.sender = owner
    agreement_id = contract.create_agreement(title, "Supplier delivery obligations", "Northwind Ltd")
    contract.add_requirement(agreement_id, "Shipment arrives within five days", "Compare the delivery event date with the published service date")
    return agreement_id


def test_draft_freeze_locks_requirements(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    agreement_id = draft(contract, direct_vm, direct_alice)
    assert contract.get_status(agreement_id) == "DRAFT"
    direct_vm.sender = direct_alice
    contract.freeze_agreement(agreement_id)
    assert contract.get_status(agreement_id) == "FROZEN"
    with direct_vm.expect_revert("Only the creator may edit a draft"):
        contract.add_requirement(agreement_id, "Changed after freeze", "Should be rejected")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the creator may freeze a draft"):
        contract.freeze_agreement(agreement_id)
    assert len(contract.get_requirements(agreement_id)) == 1


def test_same_agreement_inputs_do_not_overwrite(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    first = contract.create_agreement("Repeated", "First record", "Counterparty")
    second = contract.create_agreement("Repeated", "Second record", "Counterparty")
    assert first != second
    assert contract.get_agreement(first)["description"] == "First record"
    assert contract.get_agreement(second)["description"] == "Second record"
    assert contract.get_agreement_ids() == [first, second]


def test_url_scheme_and_bounds_are_enforced(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    agreement_id = draft(contract, direct_vm, direct_alice)
    contract.freeze_agreement(agreement_id)
    with direct_vm.expect_revert("URL must be HTTPS"):
        contract.submit_evidence(agreement_id, "http://evidence.example/report", "Report")
    with direct_vm.expect_revert("Invalid URL length"):
        contract.submit_evidence(agreement_id, "https://evidence.example/" + "x" * 2048, "Report")
    with direct_vm.expect_revert("public DNS hostname"):
        contract.submit_evidence(agreement_id, "https://localhost/report", "Report")
        oversized_draft = draft(contract, direct_vm, direct_alice)
        with direct_vm.expect_revert("Invalid requirement length"):
            contract.add_requirement(oversized_draft, "x" * 501, "Guide")


def test_duplicate_evidence_records_do_not_overwrite(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    agreement_id = draft(contract, direct_vm, direct_alice)
    contract.freeze_agreement(agreement_id)
    first = contract.submit_evidence(agreement_id, "https://evidence.example/report", "Delivery proof")
    second = contract.submit_evidence(agreement_id, "https://evidence.example/report", "Delivery proof")
    assert first != second
    assert contract.get_evidence(first)["label"] == "Delivery proof"
    assert contract.get_evidence(second)["url"] == "https://evidence.example/report"
    assert contract.get_evidence_ids(agreement_id) == [first, second]


def test_adjudication_reads_url_and_final_record_cannot_repeat(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    agreement_id = draft(contract, direct_vm, direct_alice)
    contract.freeze_agreement(agreement_id)
    evidence_id = contract.submit_evidence(agreement_id, "https://evidence.example/report", "Delivery proof")
    direct_vm.mock_web(r"evidence\.example/report", {"status": 200, "body": "Shipment delivered within five days"})
    direct_vm.mock_llm(r".*Frozen requirements.*", json.dumps({"verdict": "COMPLIANT", "reasoning": "The source states delivery occurred within five days."}))
    adjudication_id = contract.adjudicate(evidence_id)
    result = contract.get_adjudication(adjudication_id)
    assert result["verdict"] == "COMPLIANT"
    assert "within five days" in result["reasoning"]
    assert contract.get_adjudication_for_evidence(evidence_id)["adjudication_id"] == adjudication_id
    assert contract.get_status(agreement_id) == "ADJUDICATED"
    with direct_vm.expect_revert("Evidence already adjudicated"):
        contract.adjudicate(evidence_id)


def test_http_error_is_finalized_as_inconclusive(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    agreement_id = draft(contract, direct_vm, direct_alice)
    contract.freeze_agreement(agreement_id)
    evidence_id = contract.submit_evidence(agreement_id, "https://evidence.example/missing", "Unavailable source")
    direct_vm.mock_web(r"evidence\.example/missing", {"status": 503, "body": "unavailable"})
    adjudication_id = contract.adjudicate(evidence_id)
    record = contract.get_adjudication(adjudication_id)
    assert record["verdict"] == "INCONCLUSIVE"
    assert "HTTP 503" in record["reasoning"]
    assert record["source_hash"]


def test_fetched_source_is_truncated_before_hash_and_prompt(direct_vm, direct_deploy, direct_alice):
    import hashlib

    contract = direct_deploy(CONTRACT)
    agreement_id = draft(contract, direct_vm, direct_alice)
    contract.freeze_agreement(agreement_id)
    evidence_id = contract.submit_evidence(agreement_id, "https://evidence.example/large", "Long source")
    direct_vm.mock_web(r"evidence\.example/large", {"status": 200, "body": "A" * 13000})
    direct_vm.mock_llm(r".*Frozen requirements.*", json.dumps({"verdict": "INCONCLUSIVE", "reasoning": "Source did not contain enough detail."}))
    adjudication_id = contract.adjudicate(evidence_id)
    expected = hashlib.sha256(("a" * 12000).encode()).hexdigest()
    assert contract.get_adjudication(adjudication_id)["source_hash"] == expected

