# Return, refund, and cancel API overview

# Context
Cancel/Return/Refund, also referred to as 'post-transaction' or 'after-sales' can be initiated by a buyer or directly processed by a seller. TikTok Shop provides two APIs for sellers process these after-sales situations. The cancel API allows sellers to process a buyer order cancellation request as well as a direct seller order cancellation. The return API allows sellers to process a buyer order refund/ return & refund request. For situations where TikTok Shop cancels/ refunds an order, please refer to TikTok Shop Seller Academy for details.
<br>
Cancel order: Order cancellations can be initiated by a buyer after the buyer remorse window or directly canceled by the seller. For each canceled order, there is a buyer/seller cancel reason, cancel status, cancel order creation time, and the seller's process time for the buyer cancellation request. In the US and UK markets, TikTok Shop allows sellers to process partial order cancellations on item out of stock scenario.
<br>
Return order: Return orders refers to when a buyer requests to return or refund one or more items from an order. Returns can be initiated by a buyer after they have received the items. Return orders contain the buyer/seller return or refund reason, return/refund status, return or refund request time, the seller's process time for the buyer return/refund request, and the refund amount.
<br>
There are 2 ways to implement Search Cancel API and Search Return API:

* Subscribe to the [Cancellation Status Change](https://partner.tiktokshop.com/docv2/page/65030150746462028285f657) and [Return Status Change](https://partner.tiktokshop.com/docv2/page/65030162bb2a4d028d50cc51) webhooks: you must subscribe to reverse order Webhook. For more details, [click here](https://partner.tiktokshop.com/docv2/page/650512b42f024f02be19755f#Back%20To%20Top). Poll Order List periodically
* Poll Cancel order/Return order periodically

# Important Concepts
**The following table illustrates when "Cancellation," "Return," and "Refund" can be used based on the order status.**
|  | **Initiator** | **UNPAID** | **ON_HOLD** | **AWAITING_SHIPMENT** | **AWAITING_COLLECTION** | **IN_TRANSIT** | **DELIVERED** | **COMPLETED** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Cancel** | Buyer | Y | Y(Cancel request auto approve by platform. Only available in the UK) | Y <br>  | N <br>  | N | N | N |
|  | Seller | N | Y | Depends on market policy. Please see details in appendix Seller Academy link | Y <br>  | N | N | N |
| **Refund** | Buyer | N | N | N | Y | Depends on market policy. Please see details in Seller Academy in appendix | Y | N |
|  | Seller | N | N | N | Y |  | Depends on market policy. Please see details in appendix Seller Academy link | N |
| **Return** | Buyer | N | N | N | N |  | Y | N |
|  | Seller | N | N | N | N |  | Depends on market policy. Please see details in appendix Seller Academy link | N |

## Cancel/Return/Refund initiator explanation

* BUYER: The buyer that placed the order.
* SELLER: TikTok Shop seller.
* SYSTEM: Orders may be cancelled by the TikTok Shop system automatically based on TikTok Shop's policies. For example, this can happen if a package is lost in transit, and TikTok Shop detects that the tracking number has not changed for over 7 days.
* OPERATOR: Orders may also be cancelled by TikTok Shop's customer service for a variety of reasons. 


## Cancel
**Order Cancellations:** This API allows sellers to cancel paid orders as well as manage order cancellation requests. Please note, only orders that have not yet been shipped can be canceled.
<br>
Note: Buyers cannot cancel individual line items within multiple line item orders. Currently, only US and UK sellers are allowed to do partial cancel on item out of stock scenario.
<br>
**Cancel Types:** On the TikTok Shop platform, there are two types of order cancellations on TikTok Shop: buyer initiated cancellation, i.e. BUYER_CANCEL and direct cancellation, i.e. CANCEL. Seller/System/Operator can direct cancel an order. BUYER_CANCEL requires the seller to review the cancellation request. If an order's status is 'ON_HOLD', and a buyer initiates a cancellation, TikTok Shop will accept the cancellation request on behalf of the seller automatically. The seller does not need to review the cancellation request. In this case, this order will have a 'CANCEL' cancellation type.
<br>
**Cancellation Reasons:** Please refer to [our list of cancel reasons](https://partner.tiktokshop.com/docv2/page/67e61eee427345048595487d#Back%20To%20Top).
<br>
**Cancellation Order Status：**
![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/c040e21e9b904bd793949d13349afaba~tplv-k9wyc2ijk0-image.image)

**Business Case:**

* Buyer initiates a cancellation request

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/75e61ed442ab415e9c1319db3b163d4c~tplv-k9wyc2ijk0-image.image)

> **Note**: If the buyer cancellation request is made **before** the 2-business day Standard Shipping SLA from the order date, the seller must act within 24 hours. If no action is taken, TikTok Shop will auto-approve the cancellation and issue a refund. Sellers must resolve the request by either:

>    * Uploading the tracking number to the cancellation request
>    * Approving the cancellation

> Shipping the item or taking no other action will result in the cancellation being approved.
> 
> **Note**: If the cancellation request is made **after** the 2-business-day Standard Shipping SLA from the order date, but before the order is marked as **"In transit"**, TikTok Shop will automatically approve the cancellation and issue a refund.

>    * For more information on SLAs, refer to the [Fulfillment Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3995852763301633&from=policy).




* Seller initiates a cancellation

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/78c244b9a1c846e0b21c43c1281ef58f~tplv-k9wyc2ijk0-image.image)

## Refund
**Refund:** Buyers/Seller are able to initiate a refund for a line item. This API allows sellers to process buyer refund requests and issue either partial or full refunds.
<br>
Note: Currently, different markets have different refund policies. Please refer to Seller Academy for more details.
<br>
**Refund Reasons:** Please refer to [our list of refund reasons](https://partner.tiktokshop.com/docv2/page/67e61e7b8ceb0d04a320061e). 
<br>
**Refund Order Status：**
![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/190ddcc2cc9a4a959d482a4a66b750bf~tplv-k9wyc2ijk0-image.image)

Refund Order Status Explanation
| **Status** | **Description** |
| --- | --- |
| RETURN_OR_REFUND_REQUEST_PENDING | Buyer initiates a refund request, needs to be approved by seller or platform. |
| REQUEST_SUCCESS | The refund request is successful, the buyer will be refunded. |
| REQUEST_REJECTED | The seller rejected the refund request. |
| RETURN_OR_REFUND_CANCEL | The refund request has been cancelled by buyer or system. |
| RETURN_OR_REFUND_REQUEST_COMPLETE | The refund request is successful, and the amount has been refunded. |

Flow 1:  status from RETURN_OR_REFUND_REQUEST_PENDING to REQUEST_SUCCESS, then from REQUEST_SUCCESS to RETURN_OR_REFUND_REQUEST_COMPLETE
Trigger: refund request has been approved, and then the refund amount has been refunded.
Trigger initiator: Seller/System
<br>
Flow 2: status from RETURN_OR_REFUND_REQUEST_PENDING to REQUEST_REJECTED
Trigger: refund request has been rejected.
Trigger initiator: Seller
<br>
Flow 3: status from RETURN_OR_REFUND_REQUEST_PENDING to RETURN_OR_REFUND_CANCEL
Trigger: buyer cancels the refund request.
Trigger initiator: Buyer.
<br>
**Business Case:**

* Buyer initiates a refund request

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/e9669f5de4e3454e9992dd61f36362c9~tplv-k9wyc2ijk0-image.image)


* Seller initiates a refund

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/76f5c2d1f56241598968628c4c4270e7~tplv-k9wyc2ijk0-image.image)

## Return
**Return:** Buyers are able to initiate a return and get a refund for a returned order line item. This API allows sellers to accept return requests from buyers as well as initiate returns on behalf of buyers.
<br>
**Return Reasons:** [Click here for a list of our return reasons](https://partner.tiktokshop.com/docv2/page/67e61d87fcf2dd04c982ef1d). 
<br>
**Return-less Refunds:** TikTok Shop allows the sellers to change a buyer's return request and issue a refund directly. When sellers accept returns via the Approve Return API, they can choose to allow the buyer to keep the items and complete the return as a return-less refund. When seller accepts return via Approve Return API, can choose buyer keep item option to achieve returnless refund.
<br>
**Return Order Status**

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/1dfbcb33322f47f48074d94b733e0402~tplv-k9wyc2ijk0-image.image)

<br>

Return Order Status Explanation
| **Status** | **Description** |
| --- | --- |
| RETURN_OR_REFUND_REQUEST_PENDING | Buyer initiates a return request, pending seller review. |
| AWAITING_BUYER_SHIP | The return request has been approved and is waiting for the buyer to ship the item. If the buyer misses the return deadline, the request moves to RETURN_OR_REFUND_CANCEL. |
| BUYER_SHIPPED_ITEM | The buyer has shipped the item or uploaded tracking information. |
| REQUEST_REJECTED | The seller rejected the return request. |
| RECEIVE_REJECTED | The seller rejected the buyer's return package. |
| REQUEST_SUCCESS | The return request is successful, the buyer will be refunded. |
| RETURN_OR_REFUND_REQUEST_COMPLETE | The return request is complete and the refund amount has been successfully paid out. |
| RETURN_OR_REFUND_CANCEL | The return request was cancelled by the buyer, or closed by the system after deadline expiry or a seller-favored outcome. |

**Flow 1 :-**
Step 1: status from RETURN_OR_REFUND_REQUEST_PENDING to AWAITING_BUYER_SHIP
Trigger: seller or platform approves the return request.
Trigger initiator: Seller/System
<br>
Step 2: status from AWAITING_BUYER_SHIP to BUYER_SHIPPED_ITEM
Scenario A(buyer uses platform shipping to return)
Trigger: buyer shipped return package and package picked up by carrier.
Trigger initiator: System
<br>
Scenario B(buyer uses self-arrange shipping to return)
Trigger: buyer uploads the tracking number
Trigger initiator: Buyer
<br>
Step 3: status from BUYER_SHIPPED_ITEM to REQUEST_SUCCESS
Trigger: seller finished the return item(s) quality check and confirmed refund.
Trigger initiator: Seller/System
<br>
Step 4: status from REQUEST_SUCCESS to RETURN_OR_REFUND_REQUEST_COMPLETE
Trigger: the refunding for return is successful
Trigger initiator: System
<br>
**Flow 2a :-**
Step 1: status from BUYER_SHIPPED_ITEM to RECEIVE_REJECTED
Trigger: After seller checks the return item(s), seller refuses to refund for the return. 
Trigger initiator: Seller
<br>
Step 2: status from RECEIVE_REJECTED to REQUEST_SUCCESS
Trigger: The buyer submits an arbitration request to the platform, and the platform approves the buyer's return request.
Trigger initiator: System
<br>
**Flow 2b :-**
Step 1: status from BUYER_SHIPPED_ITEM to RECEIVE_REJECTED
Trigger: After seller checks the return item(s), seller refuses to refund for the return. 
Trigger initiator: Seller
<br>
Step 2: status from RECEIVE_REJECTED to RETURN_OR_REFUND_CANCEL
Trigger: After the buyer's return request is rejected and there is no arbitration raised within the given time, or if the arbitration result favors the seller.
Trigger initiator: System
<br>
**Flow 3a :-**
Step 1: status from RETURN_OR_REFUND_REQUEST_PENDING to REQUEST_REJECTED
Trigger: Seller rejects the buyer's return request.
Trigger initiator: Seller
<br>
Step 2: status from REQUEST_REJECTED to AWAITING_BUYER_SHIP
Trigger: The buyer submits an arbitration request to the platform, and the platform approves the buyer's return request.
Trigger initiator: System
<br>
**Flow 3b :-**
Step 1: status from RETURN_OR_REFUND_REQUEST_PENDING to REQUEST_REJECTED
Trigger: Seller rejects the buyer's return request.
Trigger initiator: Seller
<br>
Step 2: status from REQUEST_REJECTED to RETURN_OR_REFUND_CANCEL
Trigger: After the buyer's return request is rejected and there is no arbitration raised within the given time, or if the arbitration result favors the seller.
Trigger initiator: System
<br>
**Flow 4 :-**
Step 1: status from RETURN_OR_REFUND_REQUEST_PENDING to RETURN_OR_REFUND_CANCEL
Trigger: The request has been cancelled by the buyer.
Trigger initiator: Buyer
<br>
**Business Case:**

* Buyer initiates a return request

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/53f8bdc473654e42bb3fe7234cc1256f~tplv-k9wyc2ijk0-image.image)


* Seller initiates a return

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/1e501178d5724395ad1e5b2071e6c1ca~tplv-k9wyc2ijk0-image.image)

## **Batch Return:**
**Background:** Batch Return is a Return sub-scenario where a buyer orders multiple SKUs and submits one return request in TikTok App. The buyer expects one return journey and one shipping label/QR, while downstream seller systems usually expect one RMA containing all expected line items.
The legacy behavior can decouple unique `sku_id` values into separate `return_id` / RMA records. That breaks return-platform, OMS, WMS, and warehouse operations that need one unified record.
| Object | Purpose | Key seller action | Key identifier |
| --- | --- | --- | --- |
| Aftersales Request | Buyer-facing request object that groups all requested SKUs and quantities for one batch return. | First review at line-item level. | `aftersales_request_id` |
| RMA (package-level return order) | Logistics-executable object created from approved items after package split. | Upload shipping information and complete second review per package. | `rma_id` |

**Business Flow:**

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/72e796505b754081b8438811e3acf62e~tplv-k9wyc2ijk0-image.image)

**Business Case:**

* Buyer initiates a return request

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/f7069924fdcc4e169d55daa748b072c5~tplv-k9wyc2ijk0-image.image)
**New Webhooks:**
| Webhook | Example status | Purpose |
| --- | --- | --- |
| `AFTERSALES_REQUEST_STATUS_UPDATE` | `PENDING_REQUEST_REVIEW`, `REQUEST_REVIEW_COMPLETED` | Signals request-level lifecycle and first-review completion |
| `RMA_STATUS_UPDATE` | `RMA_CREATED` | Signals unified RMA creation for second-review / warehouse workflow |
| `REFUND_SUCCESS` | `REFUND_SUCCESS` | Signals refund success for a given sku. |
#### New / Key API Surface
| API | Role | Notes |
| --- | --- | --- |
| `/return_refund/{api_version}/aftersales/search` | Search Aftersales Request | Retrieve unified request using `aftersales_request_id` |
| `/return_refund/{api_version}/rma/search` | Search RMA Requests | Retrieve unified RMA with line-level return details |
| `/return_refund/{api_version}/aftersales/review` | Review Aftersales / RMA | Supports `request_id_type = AFTERSALES` and `request_id_type = RMA` |
| Search Aftersales Request API | First-review data fetch | Exposes all return line item IDs for the unified request |
| Search RMA Requests API | Second-review data fetch | Used after `RMA_CREATED` to sync OMS/WMS |
| Upload Shipping Document API | Label / QR upload | Used by ISV / return platform when TikTok must show buyer the label/QR |
#### Review Decision Model
| Review phase | `request_id_type` | Example decision |
| --- | --- | --- |
| 1st Review | `AFTERSALES` | Approve or reject the return request |
| 2nd Review | `RMA` | `APPROVE_RETURN_PACKAGE`, `REJECT_RETURN_PACKAGE`, or mixed line-level decision |

Line-level decisions are a major improvement: sellers can approve some returned line items and reject others based on warehouse grading. The ARD notes an MVP limitation for same-SKU split decisions; Phase 2 expands support.
## Replacement
**Replacement order status**

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/12b46ab08d524988a0d7da025076d7b5~tplv-k9wyc2ijk0-image.image)
| **Status** | **Description** |
| --- | --- |
| REPLACEMENT_REQUEST_PENDING | The buyer has initiated a replacement request. The request is pending review by seller. Seller has 24 hours to respond to the request. |
| REPLACEMENT_REQUEST_REJECT | The seller rejects the buyer's replacement request. |
| REPLACEMENT_REQUEST_REFUND_SUCCESS | Buyer's replacement request was resolved by refund due to insufficient inventory. |
| REPLACEMENT_REQUEST_CANCEL | The buyer canceled the replacement request. |
| REPLACEMENT_REQUEST_COMPLETE | The seller has approved the buyer's replacement request. The platform will generate a new order for the seller to fulfill. |

Feature brief: Replacement is initiated by buyer. The seller can reject/accept/refund the buyer request. If the seller/system accepts the buyer request, Tiktok Shop will generate a new order for the seller to reship. If sellers do not have enough inventory for the Replacement or can not send the item for Replacement, they can refund buyer directly.

Learn more about Replacement policy from [Item Replacement for Orders](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3253210454181634&from=policy&anchor_link=EB7800D0).

Case 1: status changing from REPLACEMENT_REQUEST_PENDING to REPLACEMENT_REQUEST_REJECT
Trigger: Seller received buyer replacement request and rejected the buyer replacement request. Please be aware if seller rejected buyer replacement request, buyer can initiate the dispute. 
Trigger initiator: Seller

Case 2: status changing from REPLACEMENT_REQUEST_PENDING to REPLACEMENT_REQUEST_COMPLETE
Trigger: Seller or system automatically accepts replacement requests. Please be aware if the seller/system accepts the buyer's replacement request TikTok Shop platform will automatically generate a new order for seller to fulfill. For the new orders generated for replacement, sellers should follow the same fulfillment policy as for the normal orders.
Trigger initiator: Seller/System

Case 3: status changing from REPLACEMENT_REQUEST_PENDING to REPLACEMENT_REQUEST_REFUND_SUCCESS
Trigger: Seller directly refunds the buyer. 
Trigger initiator: Seller

Case 4: status changing changing from REPLACEMENT_REQUEST_REJECT to REPLACEMENT_REQUEST_COMPLETE
Trigger: When buyer initiates dispute and TikTok Shop make a resolution that seller should execute the replacement request for the buyer.. TikTok Shop will initiate a new order for sellers to fulfill. Please be aware, for the new orders generated for replacement, sellers should follow the same fulfillment policy as for the normal orders.

**Business case**
![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/97d72133b18b49cda4d3e25426fad903~tplv-k9wyc2ijk0-image.image)


# TikTok Shop Marketplace Policies
## Policy for Responding to Buyer Requests

* The following approval nodes for cancellation/return/refund requests require seller's action, and the seller must respond to the request within 48 hours. If there is no response within 48 hours, TikTok Shop will automatically approve the corresponding request.
   * Cancel
      * When buyer initiates cancel request success, seller should respond to the request within 48 hours.
   * Refund
      * When buyer initiates refund request success, seller should respond to the request within 48 hours.
   * Return
      * When buyer initiates return request success, seller should respond to the request within 48 hours.
      * If the seller accepts the buyer's return request, the buyer will ship the item(s) back. Once the return package is delivered, the seller must respond to the return request within 48 hours.


## Cancel/Return/Refund Initiative Policy
**Policy for Initiating Cancellations**
Buyers

* Buyers can freely cancel unpaid orders.

<br>
For the UK, TikTok Shop uses the ON_HOLD status to define an order that's within the buyer remorse window. If a buyer requests an order cancellation while the order has an ON_HOLD status, TikTok Shop will automatically accept the buyer cancellation request on behalf of the seller. For regions outside of the UK, the buyer remorse window starts when the order changes to AWAITING_SHIPMENT status +1 hour. The buyer will no longer be able to request for cancellations if the seller has fulfilled the order.
<br>

* Orders that are outside of the buyer remorse window

Once an order is longer within the buyer remorse window, the cancellation must be reviewed by the seller. If an order status changes to AWAITING_COLLECTION, the buyer will no longer be able to request for a cancellation.
<br>
Sellers

* Seller cannot cancel unpaid orders.
* Seller can cancel orders with the following statuses: 'ON_HOLD', 'AWAITING_SHIPMENT' and 'AWAITING_COLLECTION'.

<br>
For more details, please refer to Seller Academy.

**Policy for Initiating Refunds**

* Buyers are allowed to initiate refund requests when the order status is 'AWAITING_COLLECTION', 'IN_TRANSIT' and 'DELIVERED'
* Sellers are allowed to initiate refund requests when the order status is 'DELIVERED'

<br>
For more details, please refer to Seller Academy.

**Policy for Initiating Returns**

* Buyers are allowed to initiate return requests when the order status is 'DELIVERED'
* In the US, sellers are allowed to initiate refund requests when the order status is 'IN_TRANSIT' and 'DELIVERED'. In other markets, sellers are not allowed to initiate returns on behalf of buyers.

<br>
For more details, please refer to Seller Academy.


# Frequently Asked Questions

* Can a seller issue a partial refund to the buyer?
   * Different markets have different policies. Please refer to Seller Academy for details.

<br>

* What is the difference between cancel and refund?
   * Cancel request can be initiated by the buyer BEFORE the seller ships an order. Once the order has been shipped, the buyer will no longer be able to cancel the order. If the package is still being delivered and the buyer insists on canceling the order, the seller should ask the buyer to initiate a refund request.

<br>

* If a seller initiates a refund, are there any additional approvals needed?
   * No. TikTok Shop will automatically refund the buyer.


# Appendix
Seller Academy Cancel/Refund/Return TikTok Shop Policy
US: 

* https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3253210454181634&from=policy

GB: 

* Cancellation: https://seller-uk.tiktok.com/university/essay?identity=1&role=1&knowledge_id=7753822474782466&from=policy
* Refund and Return: https://seller-uk.tiktok.com/university/essay?identity=1&role=1&knowledge_id=7753847099623170&from=policy

ID: 

* https://seller-id.tiktok.com/university/essay?identity=1&role=1&knowledge_id=6837727601690370&from=policy

TH: 

* https://seller-th.tiktok.com/university/essay?identity=1&role=1&knowledge_id=6837799362217730&from=policy

MY: 

* https://seller-my.tiktok.com/university/essay?identity=1&role=1&knowledge_id=7753775054259970&from=policy

VN: 

* https://seller-vn.tiktok.com/university/essay?identity=1&role=1&knowledge_id=6837773789234946&from=policy

PH:

* https://seller-ph.tiktok.com/university/essay?identity=1&role=1&knowledge_id=7654203686340353&from=policy

SG：

* https://seller-sg.tiktok.com/university/essay?identity=1&role=1&knowledge_id=7654182014830338&from=policy



