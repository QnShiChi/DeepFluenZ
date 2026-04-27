from deeptutor.services.graph.models import GraphRecommendation


def test_graph_recommendation_defaults_backup_nodes_and_reason_codes() -> None:
    recommendation = GraphRecommendation.model_validate(
        {
            "recommended_node_id": "topic_search",
            "mode": "advance",
            "score": 0.78,
        }
    )

    assert recommendation.recommended_node_id == "topic_search"
    assert recommendation.mode == "advance"
    assert recommendation.reason_codes == []
    assert recommendation.backup_node_ids == []
